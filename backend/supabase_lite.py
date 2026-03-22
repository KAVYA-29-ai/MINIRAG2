
"""
Lightweight Supabase client using httpx.

This module is a drop-in replacement for the heavy `supabase` Python SDK. It only implements
the PostgREST query-builder and Storage APIs actually used in this project, keeping the Vercel
serverless function well under the 250 MB limit.

Main Components:
- _Response: Mimics the APIResponse from the official SDK.
- _QueryBuilder: Chainable query builder for PostgREST endpoints.
- _BucketClient: Minimal storage client for buckets.

Usage:
    builder = _QueryBuilder(url, headers, table)
    response = builder.select('id,name').eq('id', 1).execute()
    print(response.data)
"""

import httpx
import json
import re
from urllib.parse import quote as urlquote

_TIMEOUT = 30.0


# ---- helpers ---------------------------------------------------------------


class _Response:
    """
    Mimics the `APIResponse` returned by the official Supabase SDK.

    Attributes:
        data: The data returned from the API call.
    """
    def __init__(self, data):
        self.data = data



def _clean_select(columns: str) -> str:
    """
    Strip whitespace around commas in a select string while preserving
    PostgREST relationship syntax like ``users!sender_id(name, avatar)``.

    Args:
        columns (str): The select string to clean.
    Returns:
        str: Cleaned select string with whitespace removed around commas.
    """
    # Split on parenthesised groups so we can clean inside and outside
    parts = re.split(r"(\([^)]*\))", columns)
    cleaned = []
    for i, part in enumerate(parts):
        if i % 2 == 0:  # outside parentheses
            part = ",".join(seg.strip() for seg in part.split(","))
        else:  # inside parentheses — also strip spaces around commas
            inner = part[1:-1]
            inner = ",".join(seg.strip() for seg in inner.split(","))
            part = f"({inner})"
        cleaned.append(part)
    return "".join(cleaned)


# ---- PostgREST query builder -----------------------------------------------


class _QueryBuilder:
    """
    Chainable query builder that mirrors the supabase-py `.table()` API.

    Methods correspond to PostgREST query verbs and filters, allowing for fluent chaining.

    Example:
        qb = _QueryBuilder(url, headers, 'users')
        qb.select('id,name').eq('id', 1).execute()
    """

    def __init__(self, url: str, headers: dict, table: str):
        """
        Initialize the query builder for a specific table.

        Args:
            url (str): Base URL for the Supabase instance.
            headers (dict): HTTP headers for authentication, etc.
            table (str): Table name to query.
        """
        self._base = f"{url}/rest/v1/{urlquote(table)}"
        self._headers = {**headers}
        self._params: list[tuple[str, str]] = []
        self._method = "GET"
        self._body = None
        self._prefer: list[str] = []

    # --- query verbs ---

    def select(self, columns: str = "*"):
        """
        Specify columns to select from the table.
        Args:
            columns (str): Comma-separated column names (default: '*').
        Returns:
            self: For chaining.
        """
        self._method = "GET"
        self._params.append(("select", _clean_select(columns)))
        return self

    def insert(self, data: dict):
        self._method = "POST"
        self._body = data
        self._prefer.append("return=representation")
        return self

    def upsert(self, data):
        self._method = "POST"
        self._body = data
        self._prefer.append("return=representation")
        self._prefer.append("resolution=merge-duplicates")
        return self

    def update(self, data: dict):
        self._method = "PATCH"
        self._body = data
        self._prefer.append("return=representation")
        return self

    def delete(self):
        self._method = "DELETE"
        self._prefer.append("return=representation")
        return self

    # --- filters ---

    def eq(self, column: str, value):
        self._params.append((column, f"eq.{value}"))
        return self

    def neq(self, column: str, value):
        self._params.append((column, f"neq.{value}"))
        return self

    def gt(self, column: str, value):
        self._params.append((column, f"gt.{value}"))
        return self

    def gte(self, column: str, value):
        self._params.append((column, f"gte.{value}"))
        return self

    def lt(self, column: str, value):
        self._params.append((column, f"lt.{value}"))
        return self

    def lte(self, column: str, value):
        self._params.append((column, f"lte.{value}"))
        return self

    def like(self, column: str, pattern: str):
        self._params.append((column, f"like.{pattern}"))
        return self

    def ilike(self, column: str, pattern: str):
        self._params.append((column, f"ilike.{pattern}"))
        return self

    def is_(self, column: str, value):
        self._params.append((column, f"is.{value}"))
        return self

    def in_(self, column: str, values: list):
        formatted = ",".join(str(v) for v in values)
        self._params.append((column, f"in.({formatted})"))
        return self

    def contains(self, column: str, value):
        self._params.append((column, f"cs.{json.dumps(value)}"))
        return self

    def contained_by(self, column: str, value):
        self._params.append((column, f"cd.{json.dumps(value)}"))
        return self

    # --- modifiers ---

    def order(self, column: str, *, desc: bool = False, nullsfirst: bool = False, nullslast: bool = False):
        direction = "desc" if desc else "asc"
        mod = f"{column}.{direction}"
        if nullsfirst:
            mod += ".nullsfirst"
        elif nullslast:
            mod += ".nullslast"
        self._params.append(("order", mod))
        return self

    def limit(self, n: int):
        self._params.append(("limit", str(n)))
        return self

    def offset(self, n: int):
        self._params.append(("offset", str(n)))
        return self

    def range(self, start: int, end: int):
        self._headers["Range"] = f"{start}-{end}"
        self._headers["Range-Unit"] = "items"
        return self

    # --- execute ---

    @staticmethod
    def _encode_postgrest_value(v: str) -> str:
        """Minimally encode a PostgREST query-parameter value.

        PostgREST gives special meaning to  , ( ) ! * .  in query values
        (column lists, embedded resources, operators).  Those MUST remain
        literal.  We only percent-encode the handful of chars that would
        break URL structure."""
        v = v.replace("%", "%25")   # must be first
        v = v.replace("&", "%26")
        v = v.replace("#", "%23")
        v = v.replace("+", "%2B")
        v = v.replace(" ", "%20")
        return v

    def _build_url(self) -> str:
        """Build the full request URL with a PostgREST-safe query string."""
        if not self._params:
            return self._base
        qs = "&".join(
            f"{k}={self._encode_postgrest_value(v)}"
            for k, v in self._params
        )
        return f"{self._base}?{qs}"

    def execute(self) -> _Response:
        headers = {**self._headers, "Content-Type": "application/json",
                   "Accept": "application/json"}
        if self._prefer:
            headers["Prefer"] = ", ".join(self._prefer)

        url = self._build_url()

        with httpx.Client(timeout=_TIMEOUT) as client:
            if self._method == "GET":
                r = client.get(url, headers=headers)
            elif self._method == "POST":
                r = client.post(url, headers=headers, json=self._body)
            elif self._method == "PATCH":
                r = client.patch(url, headers=headers, json=self._body)
            elif self._method == "DELETE":
                r = client.delete(url, headers=headers)
            else:
                raise ValueError(f"Unsupported method: {self._method}")

        if r.status_code >= 400:
            raise RuntimeError(f"PostgREST error {r.status_code}: {r.text}")

        try:
            data = r.json()
        except Exception:
            data = []

        return _Response(data if isinstance(data, list) else [data] if data else [])


# ---- Storage ---------------------------------------------------------------

class _BucketClient:
    """Minimal Supabase Storage bucket client."""

    def __init__(self, url: str, headers: dict, bucket: str):
        self._url = f"{url}/storage/v1"
        self._headers = headers
        self._bucket = bucket

    def download(self, path: str) -> bytes:
        r = httpx.get(
            f"{self._url}/object/{self._bucket}/{path}",
            headers=self._headers,
            timeout=_TIMEOUT,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Storage download error {r.status_code}: {r.text}")
        return r.content

    def upload(self, path: str, file: bytes = None, data: bytes = None,
               file_options: dict | None = None):
        """Upload bytes to storage.  Accepts *file* or *data* as the payload
        (the official SDK uses ``file``; our earlier version used ``data``)."""
        payload = file if file is not None else data
        if payload is None:
            raise ValueError("upload() requires file or data bytes")
        headers = {**self._headers}
        content_type = "application/octet-stream"
        if file_options and "content-type" in file_options:
            content_type = file_options["content-type"]
        headers["Content-Type"] = content_type
        r = httpx.post(
            f"{self._url}/object/{self._bucket}/{path}",
            headers=headers,
            content=payload,
            timeout=60.0,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Storage upload error {r.status_code}: {r.text}")
        return r.json()

    def remove(self, paths: list[str]):
        r = httpx.delete(
            f"{self._url}/object/{self._bucket}",
            headers={**self._headers, "Content-Type": "application/json"},
            json={"prefixes": paths},
            timeout=_TIMEOUT,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Storage remove error {r.status_code}: {r.text}")
        return r.json() if r.content else []


class _StorageClient:
    """Minimal Supabase Storage client."""

    def __init__(self, url: str, headers: dict):
        self._url = url
        self._headers = headers

    def from_(self, bucket: str) -> _BucketClient:
        return _BucketClient(self._url, self._headers, bucket)

    def get_bucket(self, bucket_id: str):
        r = httpx.get(
            f"{self._url}/storage/v1/bucket/{bucket_id}",
            headers=self._headers,
            timeout=_TIMEOUT,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Bucket not found: {r.status_code}")
        return r.json()

    def create_bucket(self, bucket_id: str, options: dict | None = None):
        body: dict = {"id": bucket_id, "name": bucket_id}
        if options:
            body["public"] = options.get("public", False)
        r = httpx.post(
            f"{self._url}/storage/v1/bucket",
            headers={**self._headers, "Content-Type": "application/json"},
            json=body,
            timeout=_TIMEOUT,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Bucket create error {r.status_code}: {r.text}")
        return r.json()


class _AuthClient:
    """Minimal Supabase Auth client."""

    def __init__(self, url: str, headers: dict):
        self._url = f"{url}/auth/v1"
        self._headers = headers

    def reset_password_email(self, email: str, options: dict | None = None):
        params = {}
        redirect_to = (options or {}).get("redirect_to")
        if redirect_to:
            params["redirect_to"] = redirect_to

        r = httpx.post(
            f"{self._url}/recover",
            headers={**self._headers, "Content-Type": "application/json"},
            params=params,
            json={"email": email},
            timeout=_TIMEOUT,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Auth recover error {r.status_code}: {r.text}")
        return r.json() if r.content else {}


# ---- Main client -----------------------------------------------------------

class SupabaseLiteClient:
    """Drop-in replacement for `supabase.create_client(url, key)`.
    Supports `.table(name)` and `.storage`."""

    def __init__(self, url: str, key: str):
        self._url = url.rstrip("/")
        self._headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept-Profile": "public",
            "Content-Profile": "public",
        }
        self.storage = _StorageClient(self._url, self._headers)
        self.auth = _AuthClient(self._url, self._headers)

    def table(self, name: str) -> _QueryBuilder:
        return _QueryBuilder(self._url, self._headers, name)


def create_client(url: str, key: str) -> SupabaseLiteClient:
    """Factory — mirrors `supabase.create_client`."""
    return SupabaseLiteClient(url, key)

# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-03-21
### Added
- Adaptive AI study plan endpoint: `POST /api/rag/study-plan`
- AI document summary endpoint: `GET /api/rag/pdfs/{id}/summary`
- Personalized recommendation endpoint: `GET /api/rag/recommendations`
- Shared frontend utility modules for media fallback and query matching

### Changed
- Reworked RAG ranking with blended semantic/lexical/phrase/language scoring
- Added diversity-aware result selection to reduce near-duplicate retrieved chunks
- Improved dashboard error/status handling for search, upload, and admin actions
- Rewrote backend models module with custom text hygiene architecture and clearer contracts
- Extended README API and maturity documentation

### Quality
- Frontend lint and test suite passing after refactor
- Backend test suite passing after API and ranking upgrades

## [1.0.0] - 2026-03-11
### Added
- Initial release of EduRag backend and frontend
- Authentication, user management, feedback, RAG search, analytics, and chat features
- Supabase integration for all data storage
- Documentation and setup guides

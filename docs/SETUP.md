# Local Setup Guide

Follow these steps to set up EduRag locally:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/KAVYA-29-ai/MINIRAG2.git
   cd MINIRAG2
   ```
2. **Install backend dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
3. **Install frontend dependencies:**
   ```bash
   cd ../src
   npm install
   ```
4. **Configure environment variables:**
   - Copy `.env.example` to `.env` in both backend and frontend folders and fill in required values.
5. **Run the backend server:**
   ```bash
   cd backend
   uvicorn main:app --reload
   ```
6. **Run the frontend app:**
   ```bash
   cd ../src
   npm start
   ```
7. **Access the app:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000

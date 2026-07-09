# SNUC Agent

A desktop AI assistant for SNU Chennai students that answers questions about their academics by talking directly to the university's **Digiicampus** portal — courses, assignments, attendance, mentor details, outpasses, and university posts, all through a natural-language chat interface instead of clicking around the portal.

The assistant is built on **Google's Agent Development Kit (ADK)** and wrapped in a cross-platform **Electron** desktop app. The LLM model used by this agent is fully swappable, supporting locally hosted **Ollama** models or **Google Gemini**

## Key Features

* **Chat-based access to Digiicampus** — ask for your attendance, upcoming assignments, course content, mentor's contact details, outpass status, or the latest university posts in plain English.
* **Bring your own model** — switch between providers from a Settings screen, no code changes required:
  * **Ollama** (local, private, no API costs) — tested with `gemma4:latest` and `qwen3:latest`.
  * **Google Gemini** (hosted) — just needs an API key.
* **Session history** — a sidebar of past conversations, backed by ADK's session service, so you can pick up where you left off.
* **File downloads** — course materials and assignment attachments can be fetched straight from the chat via a native save dialog.
* **Runs the backend for you** — the Electron app automatically launches and manages the local ADK server; you don't need to run any commands to start chatting.

## Tech Stack

**Agent backend**

* [Google ADK](https://github.com/google/adk-python) (`google-adk`) — agent framework, served via its built-in FastAPI server
* Python 3.12+

**Desktop app**

* [Electron](https://www.electronjs.org/)
* React 19 + TypeScript
* [shadcn/ui](https://ui.shadcn.com/)

## Prerequisites

* **Python 3.12+**
* [uv](https://docs.astral.sh/uv/) — used to create the virtual environment and install Python dependencies
* One of:
  * [Ollama](https://ollama.com/) installed locally, with a model pulled (e.g. `ollama pull qwen3:latest`), **or**
  * A **Google Gemini API key** ([Google AI Studio](https://aistudio.google.com/))
* A Digiicampus account (SNU Chennai) — the app needs its auth token to fetch your data (see Settings inside the app for instructions on obtaining it).

## Installation

Pre-built releases are available for **Mac**, **Windows**, and **Linux** from the [Releases](../../releases) page.

1. **Install uv**, if you don't already have it — see the [installation guide](https://docs.astral.sh/uv/getting-started/installation/).
2. **Download** the archive for your platform from Releases and unzip it.
3. **Open a terminal** in the unzipped folder and run:
   ```bash
   uv sync
   ```
   This sets up the Python environment the agent runs on.
4. **Double-click `snuc_agent`** to start the app. On first launch, use the in-app **Settings** dialog to pick your model (Ollama or Gemini) and link your Digiicampus account.
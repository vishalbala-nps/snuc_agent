from datetime import *
import configparser
import json
import requests

from google.adk.tools import ToolContext

DIGIICAMPUS_BASE_URL = "https://snuc.digiicampus.com/api"

def digiicampus_api_get(endpoint: str, token: str, params: dict = None) -> dict:
    """Makes an authenticated GET request to the Digiicampus API and returns the parsed JSON response."""
    response = requests.get(
        DIGIICAMPUS_BASE_URL + endpoint,
        headers={"Auth-Token": token},
        params=params,
        timeout=30
    )
    response.raise_for_status()
    return response.json()

def get_moodle_details(tool_context: ToolContext) -> dict:
    """
    Gets the user's Moodle Authentication details
    
    Returns:
    {"status": "success"} -> For Successful fetch of Authentication details
    {"status":"error","message":"<ERROR MESSAGE>"} -> For unsuccessful fetch of Authentication details
    """
    config = configparser.ConfigParser()
    files_read = config.read("config.ini")
    if (not files_read) or (not config.has_section("moodle")):
        return {"status":"error","message":"Moodle Account Details not configured! Please Configure Account Details in settings and Try Again"}
    tool_context.state["MOODLE_EMAIL"] = config.get("moodle", "email", fallback=None)
    tool_context.state["MOODLE_PASSWORD"] = config.get("moodle", "password", fallback=None)

    if (tool_context.state["MOODLE_EMAIL"] == None) or (tool_context.state["MOODLE_PASSWORD"] == None):
        return {"status":"error","message":"Moodle Account Details not configured! Please Configure Account Details in settings and Try Again"}
    tool_context.state["MOODLE_DETAILS_SET"] = True
    return {"status":"success"}

def get_digiicampus_details(tool_context: ToolContext) -> dict:
    """
    Gets the user's Digiicampus Authentication details
    
    Returns:
    {"status": "success"} -> For Successful fetch of Authentication details
    {"status":"error","message":"<ERROR MESSAGE>"} -> For unsuccessful fetch of Authentication details
    """
    config = configparser.ConfigParser()
    files_read = config.read("config.ini")
    if (not files_read) or (not config.has_section("digiicampus")):
        return {"status":"error","message":"Digiicampus Account Details not configured! Please Configure Account Details in settings and Try Again"}
    tool_context.state["DIGIICAMPUS_TOKEN"] = config.get("digiicampus", "token", fallback=None)

    if (tool_context.state["DIGIICAMPUS_TOKEN"] == None):
        return {"status":"error","message":"Digiicampus Account Details not configured! Please Configure Account Details in settings and Try Again"}
    tool_context.state["DIGIICAMPUS_DETAILS_SET"] = True
    return {"status":"success"}

def get_digiicampus_posts(tool_context: ToolContext) -> dict:
    """
    Gets the latest posts from the user's Digiicampus feed, newest first.

    Precondition: Requires Digiicampus authentication to be set (see system 
    instructions for handling missing auth).

    Parameters: None

    Returns:
    {"status": "success", "posts": [{"text": "<POST CONTENT>", "posted_time": "<YYYY-MM-DD HH:MM:SS, IST>", "author": "<AUTHOR NAME>"}, ...]} -> Successful fetch. Empty list if there are no posts.
    {"status":"error","message":"<ERROR MESSAGE>"} -> For unsuccessful fetch of the feed
    """
    token = tool_context.state.get("DIGIICAMPUS_TOKEN")
    if not token:
        return {"status":"error","message":"Digiicampus Account Details not set! Please fetch the Digiicampus Account Details first"}
    try:
        feed = digiicampus_api_get("/feedV3", token, params={"start": 0, "number": 20})
    except requests.RequestException as e:
        return {"status":"error","message":"Failed to fetch Digiicampus feed: " + str(e)}

    posts = []
    for item in feed.get("res", []):
        try:
            post = json.loads(item["object"])
        except (KeyError, TypeError, json.JSONDecodeError):
            continue
        text = post.get("text", "")
        notice = post.get("notice")
        if isinstance(notice, dict) and notice.get("description"):
            text = (text + "\n\n" + notice["description"]).strip()
        posts.append({
            "text": text,
            "posted_time": post.get("postedTime", ""),
            "author": post.get("postedByName", "")
        })
    return {"status":"success","posts":posts}
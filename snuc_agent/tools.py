from datetime import *
import base64
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
    email = config.get("moodle", "email", fallback=None)
    password = config.get("moodle", "password", fallback=None)

    if (email == None) or (password == None):
        return {"status":"error","message":"Moodle Account Details not configured! Please Configure Account Details in settings and Try Again"}
    tool_context.state["MOODLE_EMAIL"] = email
    tool_context.state["MOODLE_PASSWORD"] = password
    tool_context.state["MOODLE_DETAILS_SET"] = "True"
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
    token = config.get("digiicampus", "token", fallback=None)

    if (token == None):
        return {"status":"error","message":"Digiicampus Account Details not configured! Please Configure Account Details in settings and Try Again"}
    tool_context.state["DIGIICAMPUS_TOKEN"] = token
    tool_context.state["DIGIICAMPUS_DETAILS_SET"] = "True"
    return {"status":"success"}

def get_digiicampus_posts(tool_context: ToolContext) -> dict:
    """
    Gets the latest posts from the user's Digiicampus feed, newest first.

    Precondition: Requires Digiicampus authentication to be set. If absent, use the get_digiicampus_details tool to fetch it first

    Parameters: None

    Returns:
    {"status": "success", "posts": [{"text": "<POST CONTENT>", "posted_time": "<YYYY-MM-DD HH:MM:SS>", "author": "<AUTHOR NAME>"}, ...]} -> Successful fetch. Empty list if there are no posts.
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

def get_digiicampus_user_id(tool_context: ToolContext) -> dict:
    """
    Sets the user's Digiicampus user id (ukid) by decoding their auth token

    Precondition: Requires Digiicampus authentication to be set. If absent, use the get_digiicampus_details tool to fetch it first

    Parameters: None

    Returns:
    {"status":"success","ukid":<USER ID>} -> For Successful decode of the user id
    {"status":"error","message":"<ERROR MESSAGE>"} -> For unsuccessful decode of the user id
    """
    token = tool_context.state.get("DIGIICAMPUS_TOKEN")
    if not token:
        return {"status":"error","message":"Digiicampus Account Details not set! Please fetch the Digiicampus Account Details first"}
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        ukid = claims["ukid"]
    except (IndexError, KeyError, ValueError):
        return {"status":"error","message":"Invalid Digiicampus token! Could not decode user id"}
    tool_context.state["DIGIICAMPUS_UKID"] = str(ukid)
    tool_context.state["DIGIICAMPUS_UKID_SET"] = "True"
    return {"status":"success","ukid":str(ukid)}

def get_mentor_details(tool_context: ToolContext) -> dict:
    """
    Gets the details of the user's assigned mentor(s)

    Precondition: 
    - Requires Digiicampus authentication to be set. If absent, use the get_digiicampus_details tool to fetch it first
    - Requires Digiicampus user id to be set. If absent, use the get_digiicampus_user_id tool to fetch it first

    Parameters: None

    Returns:
    {"status":"success","mentors":[{"name":"<MENTOR NAME>","email":"<MENTOR EMAIL>","phone":"<MENTOR PHONE>"}, ...]} -> For Successful fetch of mentor details. Empty list if no mentor is assigned.
    {"status":"error","message":"<ERROR MESSAGE>"} -> For unsuccessful fetch of mentor details
    """
    token = tool_context.state.get("DIGIICAMPUS_TOKEN")
    ukid = tool_context.state.get("DIGIICAMPUS_UKID")
    if not ukid:
        return {"status":"error","message":"Digiicampus User ID not set! Please fetch the Digiicampus ukid first using the get_digiicampus_user_id tool"}
    if not token:
        return {"status":"error","message":"Digiicampus Account Details not set! Please fetch the Digiicampus Account Details first"}
    try:
        mentor_list = digiicampus_api_get("/mentorManagement/mentee/mentor/"+str(ukid), token)
    except requests.RequestException as e:
        return {"status":"error","message":"Failed to fetch Mentor details: " + str(e)}

    mentors = []
    for mentor in mentor_list:
        mentors.append({
            "name": mentor.get("name", ""),
            "email": mentor.get("email", ""),
            "phone": mentor.get("phone", "")
        })
    return {"status":"success","mentors":mentors}


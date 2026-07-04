from datetime import *
import configparser
import json
import requests

from google.adk.tools import ToolContext

DIGIICAMPUS_BASE_URL = "https://snuc.digiicampus.com"

def digiicampus_api_get(endpoint: str, token: str, params: dict = None) -> dict:
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
        feed = digiicampus_api_get("/api/feedV3", token, params={"start": 0, "number": 20})
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

def get_digiicampus_user_details(tool_context: ToolContext) -> dict:
    """
    Gets the user's Digiicampus profile details (name, email, section, department, programme, batch year and user id) and stores them in state

    Precondition: Requires Digiicampus authentication to be set. If absent, use the get_digiicampus_details tool to fetch it first

    Parameters: None

    Returns:
    {"status":"success","user_details":{"name":"<NAME>","email":"<EMAIL>","section":"<SECTION>","department":"<DEPARTMENT>","programme":"<PROGRAMME>","batch_year":"<YYYY>","ukid":"<USER ID>"}} -> For Successful fetch of the user details
    {"status":"error","message":"<ERROR MESSAGE>"} -> For unsuccessful fetch of the user details
    """
    token = tool_context.state.get("DIGIICAMPUS_TOKEN")
    if not token:
        return {"status":"error","message":"Digiicampus Account Details not set! Please fetch the Digiicampus Account Details first"}
    try:
        auth_details = digiicampus_api_get("/rest/service/authenticationDetails", token)
    except requests.RequestException as e:
        return {"status":"error","message":"Failed to fetch Digiicampus user details: " + str(e)}

    user = (auth_details.get("res") or {}).get("user")
    if not user:
        return {"status":"error","message":"Digiicampus did not return user details! Please check your account details in settings"}

    state_fields = {
        "DIGIICAMPUS_NAME": user.get("name"),
        "DIGIICAMPUS_EMAIL": user.get("email"),
        "DIGIICAMPUS_SECTION_NAME": user.get("sectionName"),
        "DIGIICAMPUS_UKID": user.get("ukid"),
        "DIGIICAMPUS_UNIVERSITY_ID": user.get("universityId"),
        "DIGIICAMPUS_COLLEGE_ID": user.get("collegeId"),
        "DIGIICAMPUS_DEPARTMENT_NAME": user.get("departmentName"),
        "DIGIICAMPUS_PROGRAMME_NAME": user.get("programmeName"),
        "DIGIICAMPUS_PROGRAMME_ID": user.get("programmeId"),
        "DIGIICAMPUS_BATCH_YEAR": user.get("batchYear"),
    }
    for key, value in state_fields.items():
        tool_context.state[key] = "" if value is None else str(value)
    tool_context.state["DIGIICAMPUS_USER_DETAILS_SET"] = "True"

    return {"status":"success","user_details":{
        "name": tool_context.state["DIGIICAMPUS_NAME"],
        "email": tool_context.state["DIGIICAMPUS_EMAIL"],
        "section": tool_context.state["DIGIICAMPUS_SECTION_NAME"],
        "department": tool_context.state["DIGIICAMPUS_DEPARTMENT_NAME"],
        "programme": tool_context.state["DIGIICAMPUS_PROGRAMME_NAME"],
        "batch_year": tool_context.state["DIGIICAMPUS_BATCH_YEAR"],
    }}

def get_active_term(tool_context: ToolContext) -> dict:
    """
    Gets the academic terms for the user's programme and batch, and stores the currently active term id in state

    Precondition:
    - Requires Digiicampus authentication to be set. If absent, use the get_digiicampus_details tool to fetch it first
    - Requires Digiicampus user details to be set. If absent, use the get_digiicampus_user_details tool to fetch them first

    Parameters: None

    Returns:
    {"status":"success","active_term_id":"<TERM ID>","terms":[{"term_id":"<TERM ID>","starts":"<YYYY-MM-DD>","ends":"<YYYY-MM-DD>","classes_till":"<YYYY-MM-DD>","academic_year_start":"<YYYY>","academic_year_end":"<YYYY>"}, ...]} -> For Successful fetch of the terms. active_term_id is "" if no term is currently active.
    {"status":"error","message":"<ERROR MESSAGE>"} -> For unsuccessful fetch of the terms
    """
    token = tool_context.state.get("DIGIICAMPUS_TOKEN")
    if not token:
        return {"status":"error","message":"Digiicampus Account Details not set! Please fetch the Digiicampus Account Details first"}
    batch = tool_context.state.get("DIGIICAMPUS_BATCH_YEAR")
    programme = tool_context.state.get("DIGIICAMPUS_PROGRAMME_ID")
    if (not batch) or (not programme):
        return {"status":"error","message":"Digiicampus User Details not set! Please fetch the Digiicampus user details first using the get_digiicampus_user_details tool"}
    try:
        term_data = digiicampus_api_get("/rest/terms/programmeBatchTerms", token, params={"batch": batch, "programme": programme})
    except requests.RequestException as e:
        return {"status":"error","message":"Failed to fetch Term details: " + str(e)}

    terms = []
    active_term_id = ""
    for term in term_data.get("terms", []):
        term_id = "" if term.get("id") is None else str(term.get("id"))
        if term.get("isActive"):
            active_term_id = term_id
        terms.append({
            "term_id": term_id,
            "starts": term.get("starts", ""),
            "ends": term.get("ends", ""),
            "classes_till": term.get("classesTill", ""),
            "academic_year_start": str(term.get("academicYearStart", "")),
            "academic_year_end": str(term.get("academicYearEnd", ""))
        })
    if active_term_id:
        tool_context.state["DIGIICAMPUS_TERM_ID"] = active_term_id
        tool_context.state["DIGIICAMPUS_TERM_ID_SET"] = "True"
    return {"status":"success","active_term_id":active_term_id,"terms":terms}

def get_attendance(tool_context: ToolContext) -> dict:
    """
    Gets the user's attendance for the currently active term, overall and per course

    Precondition:
    - Requires Digiicampus authentication to be set. If absent, use the get_digiicampus_details tool to fetch it first
    - Requires Digiicampus user details to be set. If absent, use the get_digiicampus_user_details tool to fetch them first
    - Requires the active term to be set. If absent, use the get_active_term tool to fetch it first

    Parameters: None

    Returns:
    {"status":"success","overall":{"present":<N>,"absent":<N>,"total_classes":<N>,"percentage":<0-100>,"approved_leaves":<N>,"unapproved_leaves":<N>},"courses":[{"course":"<COURSE NAME>","course_code":"<COURSE CODE>","present":<N>,"absent":<N>,"total_classes":<N>,"percentage":<0-100>}, ...]} -> For Successful fetch of attendance
    {"status":"error","message":"<ERROR MESSAGE>"} -> For unsuccessful fetch of attendance
    """
    token = tool_context.state.get("DIGIICAMPUS_TOKEN")
    if not token:
        return {"status":"error","message":"Digiicampus Account Details not set! Please fetch the Digiicampus Account Details first"}
    ukid = tool_context.state.get("DIGIICAMPUS_UKID")
    if not ukid:
        return {"status":"error","message":"Digiicampus User Details not set! Please fetch the Digiicampus user details first using the get_digiicampus_user_details tool"}
    term_id = tool_context.state.get("DIGIICAMPUS_TERM_ID")
    if not term_id:
        return {"status":"error","message":"Active term not set! Please fetch the active term first using the get_active_term tool"}
    try:
        attendance = digiicampus_api_get("/api/attendance/student/" + str(ukid) + "/term/" + str(term_id), token)
    except requests.RequestException as e:
        return {"status":"error","message":"Failed to fetch Attendance details: " + str(e)}

    overall = {
        "present": attendance.get("totalPresent", 0),
        "absent": attendance.get("totalAbsent", 0),
        "total_classes": attendance.get("totalClasses", 0),
        "percentage": round(attendance.get("percentage") or 0, 2),
        "approved_leaves": attendance.get("approvedLeaves", 0),
        "unapproved_leaves": attendance.get("unapprovedLeaves", 0)
    }
    courses = []
    for course in attendance.get("courseAttendance", []):
        code = course.get("courseCode")
        if not code:
            components = course.get("components") or []
            code = components[0].get("courseCode") if components else ""
        courses.append({
            "course": (course.get("courseName") or "").replace("\xa0", " "),
            "course_code": (code or "").strip(),
            "present": course.get("totalPresent", 0),
            "absent": course.get("totalAbsent", 0),
            "total_classes": course.get("totalClasses", 0),
            "percentage": round(course.get("percentage") or 0, 2)
        })
    return {"status":"success","overall":overall,"courses":courses}

def get_mentor_details(tool_context: ToolContext) -> dict:
    """
    Gets the details of the user's assigned mentor(s)

    Precondition: 
    - Requires Digiicampus authentication to be set. If absent, use the get_digiicampus_details tool to fetch it first
    - Requires Digiicampus user id to be set. If absent, use the get_digiicampus_user_details tool to fetch it first

    Parameters: None

    Returns:
    {"status":"success","mentors":[{"name":"<MENTOR NAME>","email":"<MENTOR EMAIL>","phone":"<MENTOR PHONE>"}, ...]} -> For Successful fetch of mentor details. Empty list if no mentor is assigned.
    {"status":"error","message":"<ERROR MESSAGE>"} -> For unsuccessful fetch of mentor details
    """
    token = tool_context.state.get("DIGIICAMPUS_TOKEN")
    ukid = tool_context.state.get("DIGIICAMPUS_UKID")
    if not ukid:
        return {"status":"error","message":"Digiicampus User ID not set! Please fetch the Digiicampus user details first using the get_digiicampus_user_details tool"}
    if not token:
        return {"status":"error","message":"Digiicampus Account Details not set! Please fetch the Digiicampus Account Details first"}
    try:
        mentor_list = digiicampus_api_get("/api/mentorManagement/mentee/mentor/"+str(ukid), token)
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


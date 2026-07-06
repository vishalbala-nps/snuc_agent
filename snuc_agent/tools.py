import configparser
import json
import logging
import requests

from google.adk.tools import ToolContext

logger = logging.getLogger(__name__)

DIGIICAMPUS_BASE_URL = "https://snuc.digiicampus.com"

#Errors
class PrerequisiteError(Exception):
    """Raised when a prerequisite cannot be satisfied.

    The message is final and user-facing: tools return it as-is in an error
    response, and the agent is instructed to report it without retrying.
    """

#Helper Functions
def digiicampus_api_get(endpoint: str, token: str, params: dict = None):
    logger.info("Digiicampus API GET %s params=%s", DIGIICAMPUS_BASE_URL + endpoint, params)
    response = requests.get(
        DIGIICAMPUS_BASE_URL + endpoint,
        headers={"Auth-Token": token},
        params=params,
        timeout=30
    )
    logger.info("Digiicampus API GET %s -> HTTP %s", endpoint, response.status_code)
    response.raise_for_status()
    return response.json()

def _read_config() -> configparser.ConfigParser:
    config = configparser.ConfigParser()
    if not config.read("config.ini"):
        raise PrerequisiteError(
            "Account details are not configured. Tell the user to configure their account details in Settings. Do not retry."
        )
    return config


def _ensure_digiicampus_auth(state) -> str:
    token = state.get("DIGIICAMPUS_TOKEN")
    if token:
        return token
    config = _read_config()
    token = config.get("digiicampus", "token", fallback=None) if config.has_section("digiicampus") else None
    if not token:
        raise PrerequisiteError(
            "The Digiicampus account is not configured. Tell the user to "
            "configure their Digiicampus account details in Settings. Do not retry."
        )
    state["DIGIICAMPUS_TOKEN"] = token
    return token


def _ensure_moodle_auth(state) -> tuple:
    email = state.get("MOODLE_EMAIL")
    password = state.get("MOODLE_PASSWORD")
    if email and password:
        return email, password
    config = _read_config()
    email = config.get("moodle", "email", fallback=None) if config.has_section("moodle") else None
    password = config.get("moodle", "password", fallback=None) if config.has_section("moodle") else None
    if not email or not password:
        raise PrerequisiteError(
            "The Moodle account is not configured. Tell the user to configure "
            "their Moodle account details in Settings. Do not retry."
        )
    state["MOODLE_EMAIL"] = email
    state["MOODLE_PASSWORD"] = password
    return email, password


def _ensure_user_details(state) -> None:
    if state.get("DIGIICAMPUS_USER_DETAILS_SET") == "True":
        return
    token = _ensure_digiicampus_auth(state)
    try:
        auth_details = digiicampus_api_get("/rest/service/authenticationDetails", token)
    except requests.RequestException as e:
        raise PrerequisiteError("Failed to fetch Digiicampus user details: " + str(e))

    user = (auth_details.get("res") or {}).get("user")
    if not user:
        raise PrerequisiteError(
            "The Digiicampus token appears to be invalid. Tell the user to "
            "reconfigure their account details in Settings. Do not retry."
        )

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
        state[key] = "" if value is None else str(value)
    state["DIGIICAMPUS_USER_DETAILS_SET"] = "True"


def _ensure_terms(state) -> str:
    """Fetches and caches the term list if not already set.

    Returns the active term id, or "" if no term is currently active
    (which is a valid, final state — not an error).
    """
    if state.get("DIGIICAMPUS_TERMS_SET") == "True":
        return state.get("DIGIICAMPUS_TERM_ID", "")
    _ensure_user_details(state)
    token = state["DIGIICAMPUS_TOKEN"]
    batch = state["DIGIICAMPUS_BATCH_YEAR"]
    programme = state["DIGIICAMPUS_PROGRAMME_ID"]
    try:
        term_data = digiicampus_api_get(
            "/rest/terms/programmeBatchTerms", token,
            params={"batch": batch, "programme": programme}
        )
    except requests.RequestException as e:
        raise PrerequisiteError("Failed to fetch Term details: " + str(e))

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

    state["DIGIICAMPUS_TERMS_JSON"] = json.dumps(terms)
    state["DIGIICAMPUS_TERM_ID"] = active_term_id
    state["DIGIICAMPUS_TERMS_SET"] = "True"
    return active_term_id


#Tools exposed to the LLM

def get_digiicampus_posts(tool_context: ToolContext) -> dict:
    """
    Gets the latest posts from the user's Digiicampus feed, newest first. 

    Parameters: None

    Returns:
    {"status":"success","posts":[{"text":"<POST CONTENT>","posted_time":"<YYYY-MM-DD HH:MM:SS>","author":"<AUTHOR NAME>"}, ...]} -> Successful fetch. Empty list if there are no posts.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.
    """
    try:
        token = _ensure_digiicampus_auth(tool_context.state)
        feed = digiicampus_api_get("/api/feedV3", token, params={"start": 0, "number": 20})
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Digiicampus feed: " + str(e)}

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
    return {"status": "success", "posts": posts}


def get_outpass_requests(tool_context: ToolContext) -> dict:
    """
    Gets the user's outpass requests from the Digiicampus, sorted newest first by last_updated. 

    Parameters: None

    Returns:
    {"status":"success","requests":[{"request_ref":"<REF>","service":"<SERVICE TITLE>","request_status":"<ongoing|closed>","action_taken":"<ACTION TAKEN>","action_type":"<positive|negative>","last_updated":"<YYYY-MM-DD HH:MM:SS>"}, ...]} -> Successful fetch. Empty list if there are no outpass requests.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.

    Notes on interpreting a request:
    - Requests are sorted newest first by last_updated: the FIRST request in the list is the user's latest (most recently acted-upon) outpass.
    - request_status "ongoing" means the request is still being processed; "closed" means it has been completed.
    - action_taken is the latest action taken on the request (e.g. "Approved").
    - action_type is the meaning of that action for the user: "positive" means a favourable outcome (e.g. the outpass was approved/granted), "negative" means an unfavourable outcome (e.g. the outpass was rejected/denied).
    - action_type is INTERNAL: use it to reason, never show it. Present each request in plain language as: "<service> — <request_status>, <outcome in words> (updated <date in words>)", e.g. "Day Scholar Pass — closed, approved (updated 6th May 2026)".
    """
    try:
        token = _ensure_digiicampus_auth(tool_context.state)
        request_data = digiicampus_api_get("/rest/campusHelpCentre/requests/v2", token)
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Outpass requests: " + str(e)}

    outpass_requests = []
    for request in request_data.get("requests", []):
        outpass_requests.append({
            "request_ref": str(request.get("requestId", "")),
            "service": request.get("serviceTitle", ""),
            "request_status": request.get("requestStatus", ""),
            "action_taken": request.get("actionTakenName", ""),
            "action_type": request.get("actionType", ""),
            "last_updated": request.get("lastUpdatedOn", "")
        })
    # Sort in code so the model never has to compare timestamps itself.
    # ISO-style "YYYY-MM-DD HH:MM:SS" strings sort correctly lexicographically;
    # empty timestamps sink to the end.
    outpass_requests.sort(key=lambda r: r["last_updated"] or "", reverse=True)
    return {"status": "success", "requests": outpass_requests}


def get_outpass_details(request_ref: str, tool_context: ToolContext) -> dict:
    """
    Gets the full details of a single outpass request, including its reason and approval progress.

    Parameters:
    request_ref: The request_ref of the outpass request, as returned by the get_outpass_requests tool.

    Returns:
    {"status":"success","details":{"service":"<SERVICE TITLE>","created_on":"<YYYY-MM-DD HH:MM:SS>","last_updated":"<YYYY-MM-DD HH:MM:SS>","description":"<REASON GIVEN BY THE USER>","progress":[{"title":"<STEP>","created_on":"<YYYY-MM-DD HH:MM:SS>","action_taken":"<ACTION>","action_type":"<positive|negative>","action_taken_on":"<YYYY-MM-DD HH:MM:SS>","handled_by":{"name":"<NAME>","phone":"<PHONE>","email":"<EMAIL>"}}, ...]}} -> Successful fetch.
    {"status":"error","message":"No outpass request exists with that request_ref. Use a request_ref returned by the get_outpass_requests tool."} -> The given request_ref does not exist. You may call get_outpass_requests to find the correct request_ref and retry ONCE with it.
    {"status":"error","message":"<OTHER ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.

    Notes on interpreting the details:
    - description is the reason the user gave when requesting the outpass.
    - progress lists the approval steps in order. The first step (title "Created") is the submission of the request itself, so its action_taken, action_type, action_taken_on and handled_by are empty.
    - For the other steps, action_taken is what the handler did, action_type is its meaning ("positive" = favourable, "negative" = unfavourable), action_taken_on is when, and handled_by is the person who handled that step.
    - For "Day Scholar Pass" requests, the approval stages mean: "Working day outpass_Parent" = approval by the student's PARENT; "Working day outpass_Admin" = approval by the student's MENTOR. Refer to the stages as "parent approval" / "mentor approval" when answering.
    - action_type and the raw stage titles are INTERNAL: use them to reason, but NEVER show them in your answer to the user.
    """
    try:
        token = _ensure_digiicampus_auth(tool_context.state)
        request_data = digiicampus_api_get("/rest/campusHelpCentre/requests/" + str(request_ref) + "/v3", token)
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return {"status": "error", "message": "No outpass request exists with that request_ref. Use a request_ref returned by the get_outpass_requests tool."}
        return {"status": "error", "message": "Failed to fetch Outpass details: " + str(e)}
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Outpass details: " + str(e)}

    description = ""
    for field in request_data.get("formDetails") or []:
        if field.get("label") == "Description":
            description = field.get("value") or ""
            break

    progress = []
    for step in request_data.get("progress") or []:
        handled_by = {}
        for log in step.get("requestWorkcentreLog") or []:
            assignee = log.get("assigneeUser")
            if assignee:
                handled_by = {
                    "name": assignee.get("name") or "",
                    "phone": assignee.get("phone") or "",
                    "email": assignee.get("email") or ""
                }
                break
        progress.append({
            "title": step.get("title") or "",
            "created_on": step.get("createdOn") or "",
            "action_taken": step.get("actionTaken") or "",
            "action_type": step.get("actionTakenType") or "",
            "action_taken_on": step.get("actionTakenOn") or "",
            "handled_by": handled_by
        })

    return {"status": "success", "details": {
        "service": request_data.get("serviceTitle") or "",
        "created_on": request_data.get("createdOn") or "",
        "last_updated": request_data.get("lastUpdatedOn") or "",
        "description": description,
        "progress": progress
    }}


def get_user_profile(tool_context: ToolContext) -> dict:
    """
    Gets the user's profile details: name, email, section, department, programme and batch year. 

    Parameters: None

    Returns:
    {"status":"success","user_details":{"name":"<NAME>","email":"<EMAIL>","section":"<SECTION>","department":"<DEPARTMENT>","programme":"<PROGRAMME>","batch_year":"<YYYY>"}} -> Successful fetch.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.
    """
    try:
        _ensure_user_details(tool_context.state)
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}

    state = tool_context.state
    return {"status": "success", "user_details": {
        "name": state["DIGIICAMPUS_NAME"],
        "email": state["DIGIICAMPUS_EMAIL"],
        "section": state["DIGIICAMPUS_SECTION_NAME"],
        "department": state["DIGIICAMPUS_DEPARTMENT_NAME"],
        "programme": state["DIGIICAMPUS_PROGRAMME_NAME"],
        "batch_year": state["DIGIICAMPUS_BATCH_YEAR"],
    }}


def get_terms(tool_context: ToolContext) -> dict:
    """
    Gets the academic terms for the user's programme and batch, including which term is currently active and term start/end dates. 

    Parameters: None

    Returns:
    {"status":"success","active_term_id":"<TERM ID>","terms":[{"term_id":"<TERM ID>","starts":"<YYYY-MM-DD>","ends":"<YYYY-MM-DD>","classes_till":"<YYYY-MM-DD>","academic_year_start":"<YYYY>","academic_year_end":"<YYYY>"}, ...]} -> Successful fetch. active_term_id is "" if no term is currently active.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.
    """
    try:
        active_term_id = _ensure_terms(tool_context.state)
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}

    terms = json.loads(tool_context.state.get("DIGIICAMPUS_TERMS_JSON", "[]"))
    return {"status": "success", "active_term_id": active_term_id, "terms": terms}


def get_attendance(tool_context: ToolContext) -> dict:
    """
    Gets the user's attendance for the currently active term, overall and per course. 

    Parameters: None

    Returns:
    {"status":"success","overall":{"present":<N>,"absent":<N>,"total_classes":<N>,"percentage":<0-100>,"approved_leaves":<N>,"unapproved_leaves":<N>},"courses":[{"course":"<COURSE NAME>","course_code":"<COURSE CODE>","present":<N>,"absent":<N>,"total_classes":<N>,"percentage":<0-100>}, ...]} -> Successful fetch.
    {"status":"unavailable","message":"<MESSAGE>"} -> No active term exists, so attendance cannot be fetched. Final. Report to the user; do NOT retry.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.
    """
    state = tool_context.state
    try:
        term_id = _ensure_terms(state)
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}

    if not term_id:
        return {"status": "unavailable", "message": "No term is currently active, so attendance is unavailable. Report this to the user; do NOT retry."}

    try:
        attendance = digiicampus_api_get(
            "/api/attendance/student/" + str(state["DIGIICAMPUS_UKID"]) + "/term/" + str(term_id),
            state["DIGIICAMPUS_TOKEN"]
        )
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Attendance details: " + str(e)}

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
    return {"status": "success", "overall": overall, "courses": courses}


def get_mentor_details(tool_context: ToolContext) -> dict:
    """
    Gets the details of the user's assigned mentor(s). 

    Parameters: None

    Returns:
    {"status":"success","mentors":[{"name":"<MENTOR NAME>","email":"<MENTOR EMAIL>","phone":"<MENTOR PHONE>"}, ...]} -> Successful fetch. Empty list if no mentor is assigned.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.
    """
    state = tool_context.state
    try:
        _ensure_user_details(state)
        mentor_data = digiicampus_api_get(
            "/api/mentorManagement/mentee/mentor/" + str(state["DIGIICAMPUS_UKID"]),
            state["DIGIICAMPUS_TOKEN"]
        )
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Mentor details: " + str(e)}

    mentors = []
    for mentor in mentor_data:
        mentors.append({
            "name": mentor.get("name", ""),
            "email": mentor.get("email", ""),
            "phone": mentor.get("phone", "")
        })
    return {"status": "success", "mentors": mentors}

def get_digiicampus_courses(tool_context: ToolContext) -> dict:
    """
    Gets the user's enrolled courses from the Digiicampus. 

    Parameters: None

    Returns:
    {"status":"success","courses":[{"course_ref":"<REF>","class_ref":"<REF>","course_code":"<CODE>","course_name":"<NAME>","credits":<N>,"component":"<Lecture|Practical|Tutorial>"}, ...]} -> Successful fetch. Empty list if no courses are found.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.

    Notes on interpreting the courses:    
    - All components of a course share the SAME credits: the credits value is for the course as a whole, repeated on each component entry. Never add up credits across components — e.g. a course listed with 4 credits as both Lecture and Practical is worth 4 credits total, not 8.
    - Present each course grouped, as: "<course_name> (<course_code>) — <credits> credits, <components>", e.g. "Data Structures + Lab (CS1736) — 4 credits, Lecture and Practical".
    - After listing the courses, end your answer by offering to show the modules of any course.
    """
    try:
        token = _ensure_digiicampus_auth(tool_context.state)
        course_data = digiicampus_api_get("/rest/classes/v1/classroom", token)
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Courses: " + str(e)}

    courses = []
    for course in course_data:
        courses.append({
            "course_ref": str(course.get("courseId", "")),
            "class_ref": str(course.get("id", "")),
            "course_code": (course.get("courseCode") or "").replace("\xa0", " ").strip(),
            "course_name": (course.get("courseName") or "").replace("\xa0", " ").strip(),
            "credits": course.get("courseCredits", 0),
            "component": course.get("courseComponentTypeName", "")
        })
    return {"status": "success", "courses": courses}


def get_digiicampus_course_modules(class_ref: str, tool_context: ToolContext) -> dict:
    """
    Gets the modules of one course component.

    Parameters:
    class_ref: The class_ref of the course component, as returned by the get_digiicampus_courses tool. Content is per component: a course's Lecture and Practical components have different class_refs and different content.

    Returns:
    {"status":"success","modules":[{"module_ref":"<REF>","module":"<e.g. UNIT 1>","title":"<MODULE TITLE>","description":"<SYLLABUS OF THE MODULE>"}, ...]} -> Successful fetch. Empty list if the course has no content yet.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.
    
    """
    try:
        token = _ensure_digiicampus_auth(tool_context.state)
        module_data = digiicampus_api_get("/rest/classroomV2/class/" + str(class_ref) + "/module", token)
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Course modules: " + str(e)}

    modules = []
    for entry in module_data:
        module = entry.get("module") or {}
        modules.append({
            "module_ref": str(module.get("id", "")),
            "module": module.get("module") or "",
            "title": module.get("title") or "",
            "description": module.get("description") or ""
        })
    return {"status": "success", "modules": modules}

def get_digiicampus_course_module_content(class_ref: str, module_ref: str, tool_context: ToolContext) -> dict:
    """
    Gets the downloadable course content (files shared for each session) of ONE module of a course component.

    Parameters:
    class_ref: The class_ref of the course component, as returned by the get_digiicampus_courses tool.
    module_ref: The module_ref of the module, as returned by the get_digiicampus_course_modules tool for the same class_ref.

    Returns:
    {"status":"success","sessions":[{"session_name":"<SESSION NAME>","media_ref":"<REF>","media_name":"<FILE NAME>","created_on":"<YYYY-MM-DD HH:MM:SS>"}, ...]} -> Successful fetch, in session order. Empty list if the module has no content yet.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.

    Notes on interpreting the content:
    - Present each session's file by its session_name, media_name and created_on date. The actual download link is stored internally, keyed by media_ref — you never see or output the URL itself.

    """
    state = tool_context.state
    try:
        token = _ensure_digiicampus_auth(state)
        resource_data = digiicampus_api_get("/rest/classroomV2/resources", token, params={"classId": class_ref})
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Course content: " + str(e)}

    # Keep the huge presigned URLs out of the LLM context: store them in state
    # keyed by media_ref, so a download tool can look them up later. The API
    # returns the whole course, so cache every URL, but only report the
    # requested module's sessions to the LLM.
    media_urls = json.loads(state.get("DIGIICAMPUS_MEDIA_URLS_JSON", "{}"))

    sessions = []
    for resource in sorted(resource_data, key=lambda r: (r.get("moduleOrder") or 0, r.get("sessionOrder") or 0)):
        media_ref = str(resource.get("mediaId", ""))
        if resource.get("mediaUrl"):
            media_urls[media_ref] = resource["mediaUrl"]
        if str(resource.get("moduleId", "")) != str(module_ref):
            continue
        sessions.append({
            "session_name": (resource.get("sessionName") or "").replace("\xa0", " ").strip(),
            "media_ref": media_ref,
            "media_name": (resource.get("mediaName") or "").replace("\xa0", " ").strip(),
            "created_on": resource.get("createdTimestamp") or ""
        })

    state["DIGIICAMPUS_MEDIA_URLS_JSON"] = json.dumps(media_urls)
    return {"status": "success", "sessions": sessions}


def fetch_download_url(media_ref: str, tool_context: ToolContext) -> dict:
    """
    Prepares the download of one course content file. The download itself is handled by the app UI — you only need to call this tool and confirm to the user.

    Parameters:
    media_ref: The media_ref of the file, as returned by the get_digiicampus_course_module_content tool.

    Returns:
    {"status":"success","message":"Download prepared."} -> The download was prepared; tell the user the file's download is starting.
    {"status":"error","message":"Unknown media_ref. Call the get_digiicampus_course_module_content tool for the file's module first, then retry ONCE with a media_ref it returned."} -> The given media_ref is not known. Follow the message.
    
    """
    state = tool_context.state
    media_urls = json.loads(state.get("DIGIICAMPUS_MEDIA_URLS_JSON", "{}"))
    url = media_urls.get(str(media_ref))
    if not url:
        return {"status": "error", "message": "Unknown media_ref. Call the get_digiicampus_course_module_content tool for the file's module first, then retry ONCE with a media_ref it returned."}
    state["DOWNLOAD_URL"] = url
    return {"status": "success", "message": "Download prepared."}


def get_digiicampus_assignments(class_ref: str, tool_context: ToolContext) -> dict:
    """
    Gets the assignments of one course component, split into previous (already started) and upcoming (not yet started) assignments.

    Parameters:
    class_ref: The class_ref of the course component, as returned by the get_digiicampus_courses tool.

    Returns:
    {"status":"success","previous_assignments":[{"assignment_ref":"<REF>","name":"<ASSIGNMENT NAME>","start_date":"<YYYY-MM-DD HH:MM:SS>","due_date":"<YYYY-MM-DD HH:MM:SS>","isSubmitted":<true|false>,"dueDatePassed":<true|false>}, ...],"upcoming_assignments":[...same shape...]} -> Successful fetch. isSubmitted tells whether the user has submitted that assignment. Empty lists if there are no assignments.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.

    Notes on interpreting the content:
    - Present each assignment with its name, start_date, and due_date.
    - If isSubmitted is true -> the assignment has already been submitted.
    - If dueDatePassed is true -> the assignment is overdue and can no longer be submitted.
    """
    state = tool_context.state
    try:
        _ensure_user_details(state)
        assignment_data = digiicampus_api_get(
            "/rest/classes/" + str(class_ref) + "/users/" + state["DIGIICAMPUS_UKID"] + "/assignments",
            state["DIGIICAMPUS_TOKEN"]
        )
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Assignments: " + str(e)}

    def trim(assignments):
        return [{
            "assignment_ref": str(a.get("id", "")),
            "name": a.get("name") or "",
            "start_date": a.get("startDate") or "",
            "due_date": a.get("dueDate") or "",
            "isSubmitted": bool(a.get("isSubmitted")),
            "dueDatePassed": bool(a.get("dueDatePassed")),
            "isGraded": bool(a.get("isGraded")),
            "grade": a.get("grade") or "",
        } for a in assignments or []]

    res = assignment_data.get("res") or {}
    return {
        "status": "success",
        "previous_assignments": trim(res.get("previousAssignments")),
        "upcoming_assignments": trim(res.get("upcomingAssignments"))
    }


def get_digiicampus_assignment_details(class_ref: str, assignment_ref: str, tool_context: ToolContext) -> dict:
    """
    Gets the full details of ONE assignment, including its description, the files attached to the assignment (resources), and the files the user submitted for it.

    Parameters:
    class_ref: The class_ref of the course component, as returned by the get_digiicampus_courses tool.
    assignment_ref: The assignment_ref of the assignment, as returned by the get_digiicampus_assignments tool for the same class_ref.

    Returns:
    {"status":"success","name":"<ASSIGNMENT NAME>","description":"<FULL TASK DESCRIPTION>","start_date":"<YYYY-MM-DD HH:MM:SS>","due_date":"<YYYY-MM-DD HH:MM:SS>","isSubmitted":<true|false>,"resources":[{"media_ref":"<REF>","media_name":"<FILE NAME>"}, ...],"submissions":[...same schema...],isGraded":<true|false>,"grade":"<GRADE>","assignmentMarks": {"minimumMarks":<MINIMUM_MARKS>,"maximumMarks":<MAXIMUM_MARKS>}} -> Successful fetch. resources lists the file(s) attached to the assignment (e.g. the question PDF); submissions lists the file(s) the user submitted. Either list may be empty.
    {"status":"error","message":"<ERROR MESSAGE>"} -> Final failure. Report the message to the user; do NOT retry.

    Notes on interpreting the content:
    - Present the assignment with its name, description, start_date, due_date, and the list of resources and submitted files (if any).
    - If isSubmitted is true -> the assignment has already been submitted.
    - If dueDatePassed is true -> the assignment is overdue and can no longer be submitted.
    """
    state = tool_context.state
    try:
        token = _ensure_digiicampus_auth(state)
        detail_data = digiicampus_api_get(
            "/rest/assignments/v1/getStudentAssignmentDetails", token,
            params={"assignmentId": assignment_ref, "classId": class_ref}
        )
    except PrerequisiteError as e:
        return {"status": "error", "message": str(e)}
    except requests.RequestException as e:
        return {"status": "error", "message": "Failed to fetch Assignment details: " + str(e)}

    # Resource and submitted files carry presigned URLs too: cache them in
    # state so fetch_download_url can serve them, and give the LLM only
    # name + ref.
    media_urls = json.loads(state.get("DIGIICAMPUS_MEDIA_URLS_JSON", "{}"))

    def trim_files(entries):
        files = []
        for entry in entries or []:
            media_ref = str(entry.get("mediaId", ""))
            if entry.get("mediaUrl"):
                media_urls[media_ref] = entry["mediaUrl"]
            files.append({
                "media_ref": media_ref,
                "media_name": (entry.get("mediaName") or "").replace("\xa0", " ").strip()
            })
        return files

    resources = trim_files(detail_data.get("resources"))
    submissions = trim_files(detail_data.get("submissions"))
    state["DIGIICAMPUS_MEDIA_URLS_JSON"] = json.dumps(media_urls)

    return {
        "status": "success",
        "name": detail_data.get("name") or "",
        "description": (detail_data.get("description") or "").replace("\xa0", " ").strip(),
        "start_date": detail_data.get("startDate") or "",
        "due_date": detail_data.get("dueDate") or "",
        "isSubmitted": bool(detail_data.get("isSubmitted")),
        "due_date_passed": bool(detail_data.get("dueDatePassed")),
        "resources": resources,
        "submissions": submissions,
        "isGraded": bool(detail_data.get("isGraded")),
        "grade": detail_data.get("grade") or "",
        "assignmentMarks": detail_data.get("assignmentMarks") or {}
    }

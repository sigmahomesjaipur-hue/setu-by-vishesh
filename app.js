const launchStorageKeys = ["setuLeaveRequests", "setuLeaveBalances", "setuSites", "setuActiveSiteId", "setuUsers", "setuEmployeeProfiles", "setuSalarySettings", "setuTasks", "officeRadius", "officeLatitude", "officeLongitude"];
if (localStorage.getItem("setuLaunchReset2026") !== "1") {
  launchStorageKeys.forEach(key => localStorage.removeItem(key));
  Object.keys(localStorage).filter(key => key.indexOf("setuEmployeeSession:") === 0).forEach(key => localStorage.removeItem(key));
  localStorage.setItem("setuLaunchReset2026", "1");
}

const state = {
  role: "employee",
  loggedIn: false,
  currentUserId: null,
  page: "overview",
  checkedIn: false,
  checkedOut: false,
  checkInAt: null,
  checkOutAt: null,
  tasks: [],
  radius: 100,
  cutoff: "19:00",
  selectedEmployee: "SHI-042",
  selectedMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
  selectedDate: new Date().toISOString().slice(0, 10),
  leaveModal: false,
  siteEditingId: null,
  leaveRequests: JSON.parse(localStorage.getItem("setuLeaveRequests") || "[]"),
  leaveBalances: JSON.parse(localStorage.getItem("setuLeaveBalances") || "{}"),
  office: { latitude: 12.9352, longitude: 77.6245 },
  sites: JSON.parse(localStorage.getItem("setuSites") || "null") || [],
  activeSiteId: localStorage.getItem("setuActiveSiteId") || "",
  location: { status: "idle", action: null, latitude: null, longitude: null, accuracy: null, distance: null, updatedAt: null, error: "" },
  matchedSiteId: null,
  checkInLocation: null,
  checkOutLocation: null,
  userEditingId: null,
  userModal: false,
  userFormDraft: null,
  performanceEmployeeId: "SHI-042",
  salarySettings: JSON.parse(localStorage.getItem("setuSalarySettings") || "{}"),
  employeeSession: null,
  tasksByEmployee: JSON.parse(localStorage.getItem("setuTasks") || "null") || [],
  attendanceRows: JSON.parse(localStorage.getItem("setuAttendanceRows") || "[]"),
  refreshTimer: null,
  activeFormDraft: null,
};

const seedAdminUsername = "admin@sigmahome.in";
const seedPassword = "sigma@2026";
function isUuid(value) { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
const supabaseConfig = window.SETU_SUPABASE_CONFIG || {};
const hasUsableSupabaseKey = typeof supabaseConfig.anonKey === "string" && supabaseConfig.anonKey.length > 20 && supabaseConfig.anonKey !== "******" && !supabaseConfig.anonKey.includes("YOUR_");
const supabaseClient = supabaseConfig.url && hasUsableSupabaseKey && window.supabase
  ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;
let workspaceChannel = null;
if (localStorage.getItem("officeRadius")) state.radius = Number(localStorage.getItem("officeRadius")) || state.radius;
if (localStorage.getItem("officeCheckInCutoff")) state.cutoff = normalizeTime(localStorage.getItem("officeCheckInCutoff")) || state.cutoff;
if (localStorage.getItem("officeLatitude")) state.office.latitude = Number(localStorage.getItem("officeLatitude")) || state.office.latitude;
if (localStorage.getItem("officeLongitude")) state.office.longitude = Number(localStorage.getItem("officeLongitude")) || state.office.longitude;
const employees = [];
function legacySite() { return { name: "Legacy office", latitude: state.office.latitude, longitude: state.office.longitude, radius: Number(state.radius), address: "Configured legacy office" }; }
function assignedSite() {
  const user = currentUser();
  return state.sites.find(site => site.id === user?.siteId && site.enabled) || null;
}
function siteAtLocation(latitude = state.location.latitude, longitude = state.location.longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const ranked = state.sites.filter(site => site.enabled).map(site => ({ site, distance: distanceInMetres(latitude, longitude, site.latitude, site.longitude) })).sort((a, b) => a.distance - b.distance);
  return ranked[0]?.site || null;
}
function detectedSite() {
  return state.sites.find(site => site.id === state.matchedSiteId && site.enabled) || siteAtLocation() || null;
}
function activeSite() {
  if (state.role === "employee") return detectedSite() || { name: "Site detected at check-in", latitude: 0, longitude: 0, radius: 0, address: "Location will identify the nearest enabled site" };
  return state.sites.find(site => site.id === state.activeSiteId && site.enabled) || state.sites.find(site => site.enabled) || legacySite();
}
function persistSites() { localStorage.setItem("setuSites", JSON.stringify(state.sites)); localStorage.setItem("setuActiveSiteId", state.activeSiteId); }
const defaultUsers = [
  { id: "user-admin", name: "Administrator", username: seedAdminUsername, role: "Admin", status: "Active", department: "Administration", siteId: "", password: seedPassword, employeeId: null },
];
const users = (() => {
  const storedUsers = JSON.parse(localStorage.getItem("setuUsers") || "null");
  if (storedUsers && Array.isArray(storedUsers) && storedUsers.length) return storedUsers;
  localStorage.setItem("setuUsers", JSON.stringify(defaultUsers));
  return defaultUsers;
})();
const employeeProfiles = JSON.parse(localStorage.getItem("setuEmployeeProfiles") || "{}");
function employeeRoster() {
  const profiles = Object.values(employeeProfiles);
  const managed = users.filter(user => user.role === "Employee").map(user => employeeProfiles[user.employeeId || user.id] || { id: user.employeeId || user.id, name: user.name, role: user.department || "Employee", team: user.department || "General", email: user.username, phone: "—", joined: "—", salary: "₹0 / month", attendanceSeeded: false });
  return [...employees, ...profiles, ...managed].filter((profile, index, list) => list.findIndex(item => item.id === profile.id) === index);
}
function persistUsers() { localStorage.setItem("setuUsers", JSON.stringify(users)); }
function persistProfiles() { localStorage.setItem("setuEmployeeProfiles", JSON.stringify(employeeProfiles)); }
function refreshFromStorage(key) {
  if (key === "setuUsers") {
    const next = JSON.parse(localStorage.getItem(key) || "[]");
    users.splice(0, users.length, ...next);
  }
  if (key === "setuEmployeeProfiles") {
    Object.keys(employeeProfiles).forEach(id => delete employeeProfiles[id]);
    Object.assign(employeeProfiles, JSON.parse(localStorage.getItem(key) || "{}"));
  }
  if (key === "setuSites") state.sites = JSON.parse(localStorage.getItem(key) || "[]");
  if (key === "setuTasks") state.tasksByEmployee = JSON.parse(localStorage.getItem(key) || "[]");
  if (key === "setuLeaveRequests") state.leaveRequests = JSON.parse(localStorage.getItem(key) || "[]");
  if (key === "setuLeaveBalances") state.leaveBalances = JSON.parse(localStorage.getItem(key) || "{}");
  if (key === "setuSalarySettings") state.salarySettings = JSON.parse(localStorage.getItem(key) || "{}");
  if (key === "setuAttendanceRows") state.attendanceRows = JSON.parse(localStorage.getItem(key) || "[]");
  if (key === "officeCheckInCutoff") state.cutoff = normalizeTime(localStorage.getItem(key)) || state.cutoff;
  if (key === state.employeeSession && state.currentUserId) loadEmployeeSession(currentUser());
}
window.addEventListener("storage", event => {
  if (!event.key) return;
  refreshFromStorage(event.key);
  render();
});
function currentUser() {
  return users.find(user => user.id === state.currentUserId) || (state.currentUserId ? { id: state.currentUserId, role: state.role === "admin" ? "Admin" : "Employee", employeeId: state.currentUserId } : users[0]);
}
function leaveBalance(employeeId) { return Number.isFinite(Number(state.leaveBalances[employeeId])) ? Number(state.leaveBalances[employeeId]) : 12; }
function leaveDays(request) {
  const start = new Date(`${request.startDate}T12:00:00`);
  const end = new Date(`${request.endDate}T12:00:00`);
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}
function persistLeaveBalances() { localStorage.setItem("setuLeaveBalances", JSON.stringify(state.leaveBalances)); }
function activeAdminCount() { return users.filter(user => user.role === "Admin" && user.status === "Active").length; }
function currentEmployee() {
  const user = currentUser();
  return getEmployee(user?.employeeId || state.currentUserId);
}
function loadEmployeeSession(user) {
  if (!user || user.role !== "Employee") return;
  const key = `setuEmployeeSession:${user.id}`;
  const saved = JSON.parse(localStorage.getItem(key) || "null") || { checkedIn: false, checkedOut: false, checkInAt: null, checkOutAt: null, tasks: [], checkInLocation: null, checkOutLocation: null };
  state.employeeSession = key;
  state.checkedIn = Boolean(saved.checkedIn);
  state.checkedOut = Boolean(saved.checkedOut);
  state.checkInAt = saved.checkInAt || null;
  state.checkOutAt = saved.checkOutAt || null;
  state.tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
  state.checkInLocation = saved.checkInLocation || null;
  state.checkOutLocation = saved.checkOutLocation || null;
  const todayRow = state.attendanceRows.find(row => row.employee_id === user.id && row.attendance_date === todayIso());
  if (todayRow) {
    state.checkedIn = Boolean(todayRow.check_in_at);
    state.checkedOut = Boolean(todayRow.check_out_at);
    state.checkInAt = todayRow.check_in_at ? new Date(todayRow.check_in_at).getTime() : null;
    state.checkOutAt = todayRow.check_out_at ? new Date(todayRow.check_out_at).getTime() : null;
  }
}
function persistEmployeeSession() {
  if (state.employeeSession) localStorage.setItem(state.employeeSession, JSON.stringify({ checkedIn: state.checkedIn, checkedOut: state.checkedOut, checkInAt: state.checkInAt, checkOutAt: state.checkOutAt, tasks: state.tasks, checkInLocation: state.checkInLocation, checkOutLocation: state.checkOutLocation }));
}
function persistAttendanceRows() { localStorage.setItem("setuAttendanceRows", JSON.stringify(state.attendanceRows)); }
function persistTasks() { localStorage.setItem("setuTasks", JSON.stringify(state.tasksByEmployee)); }
function employeeTasks(employeeId) {
  return state.tasksByEmployee.filter(task => task.employeeId === employeeId);
}
async function loadSupabaseWorkspace(authEmail = "") {
  if (!supabaseClient) return;
  const [{ data: profiles, error: profilesError }, { data: sites, error: sitesError }, { data: settings, error: settingsError }, { data: leaveRows, error: leaveError }, { data: attendanceRows, error: attendanceError }] = await Promise.all([
    supabaseClient.from("profiles").select("*"),
    supabaseClient.from("sites").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("workspace_settings").select("*").eq("id", "default").maybeSingle(),
    supabaseClient.from("leave_requests").select("*").order("created_at", { ascending: true }),
    supabaseClient.from("attendance").select("*").order("attendance_date", { ascending: false }),
  ]);
  if (profilesError) throw profilesError;
  if (sitesError) throw sitesError;
  if (settingsError && settingsError.code !== "42P01") throw settingsError;
  if (leaveError) throw leaveError;
  if (attendanceError) throw attendanceError;
  state.attendanceRows = attendanceRows || [];
  persistAttendanceRows();
  const todayAttendance = state.attendanceRows.find(row => row.employee_id === state.currentUserId && row.attendance_date === new Date().toISOString().slice(0, 10));
  if (todayAttendance) {
    state.checkedIn = Boolean(todayAttendance.check_in_at);
    state.checkedOut = Boolean(todayAttendance.check_out_at);
    state.checkInAt = todayAttendance.check_in_at ? new Date(todayAttendance.check_in_at).getTime() : null;
    state.checkOutAt = todayAttendance.check_out_at ? new Date(todayAttendance.check_out_at).getTime() : null;
  }
  if (settings) {
    state.radius = settings.legacy_radius;
    state.cutoff = normalizeTime(settings.check_in_cutoff) || state.cutoff;
    localStorage.setItem("officeCheckInCutoff", state.cutoff);
  }
  state.sites = Array.isArray(sites) ? sites : [];
  state.activeSiteId = state.activeSiteId || state.sites.find(site => site.enabled)?.id || "";
  state.leaveRequests = (leaveRows || []).map(request => ({
    id: request.id,
    employeeId: request.employee_id,
    type: request.leave_type,
    startDate: request.start_date,
    endDate: request.end_date,
    reason: request.reason,
    status: request.status,
    submittedAt: request.created_at,
    reviewedAt: request.reviewed_at,
  }));
  const existingUsers = new Map(users.map(user => [user.id, user]));
  const remoteUsers = (profiles || []).map(profile => {
    const existing = existingUsers.get(profile.id);
    const username = profile.email || existing?.username || (profile.id === state.currentUserId ? authEmail : `user-${profile.id.slice(0, 8)}`);
    const next = {
      id: profile.id,
      name: profile.full_name,
      username,
      role: profile.role === "admin" ? "Admin" : "Employee",
      status: profile.status,
      department: profile.department || "",
      siteId: existing?.siteId || "",
      password: existing?.password,
      employeeId: profile.role === "employee" ? profile.id : null,
    };
    if (existing) Object.assign(existing, next);
    if (next.role === "Employee") {
      employeeProfiles[next.id] = { id: next.id, name: next.name, role: next.department || "Employee", team: next.department || "General", email: username, phone: "—", joined: profile.created_at?.slice(0, 10) || "—", salary: "₹0 / month", attendanceSeeded: false };
      state.leaveBalances[next.id] = profile.leave_balance;
    }
    return existing || next;
  });
  users.splice(0, users.length, ...remoteUsers);
  persistUsers();
  persistProfiles();
  persistLeaveBalances();
}
async function refreshAttendanceState() {
  if (supabaseClient) {
    const { data, error } = await supabaseClient.from("attendance").select("*").order("attendance_date", { ascending: false });
    if (error) { console.error("Could not refresh attendance.", error); return; }
    state.attendanceRows = data || [];
    persistAttendanceRows();
  } else {
    state.attendanceRows = JSON.parse(localStorage.getItem("setuAttendanceRows") || "[]");
  }
  const todayRow = state.attendanceRows.find(row => row.employee_id === state.currentUserId && row.attendance_date === todayIso());
  if (todayRow && state.role === "employee") {
    state.checkedIn = Boolean(todayRow.check_in_at);
    state.checkedOut = Boolean(todayRow.check_out_at);
    state.checkInAt = todayRow.check_in_at ? new Date(todayRow.check_in_at).getTime() : null;
    state.checkOutAt = todayRow.check_out_at ? new Date(todayRow.check_out_at).getTime() : null;
  }
  if (state.loggedIn) render();
}
function subscribeToSharedLeaveRequests() {
  if (!supabaseClient || workspaceChannel) return;
  workspaceChannel = supabaseClient
    .channel("shared-leave-requests")
    .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, async () => {
      try { await loadSupabaseWorkspace(); render(); } catch (error) { console.error("Could not refresh shared leave requests.", error); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, async () => {
      try { await refreshAttendanceState(); } catch (error) { console.error("Could not refresh shared attendance.", error); }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "workspace_settings" }, async () => {
      try { await loadSupabaseWorkspace(); render(); } catch (error) { console.error("Could not refresh shared attendance settings.", error); }
    })
    .subscribe();
}
async function saveSharedAttendance(action) {
  if (!state.currentUserId) return;
  const today = new Date().toISOString().slice(0, 10);
  const site = detectedSite();
  const location = action === "check-in" ? state.checkInLocation : state.checkOutLocation;
  if (!supabaseClient) {
    const existing = state.attendanceRows.find(row => row.employee_id === state.currentUserId && row.attendance_date === today) || { id: `local-${state.currentUserId}-${today}`, employee_id: state.currentUserId, attendance_date: today };
    if (action === "check-in") Object.assign(existing, { check_in_at: new Date(state.checkInAt).toISOString(), site_id: site?.id || null, check_in_latitude: location?.latitude, check_in_longitude: location?.longitude, check_in_accuracy: location?.accuracy });
    else Object.assign(existing, { check_out_at: new Date(state.checkOutAt).toISOString(), check_out_latitude: location?.latitude, check_out_longitude: location?.longitude, check_out_accuracy: location?.accuracy });
    const index = state.attendanceRows.findIndex(row => row.id === existing.id);
    if (index >= 0) state.attendanceRows[index] = existing; else state.attendanceRows.unshift(existing);
    persistAttendanceRows();
    return;
  }
  const payload = action === "check-in"
    ? { employee_id: state.currentUserId, attendance_date: today, site_id: site?.id || null, check_in_at: new Date(state.checkInAt).toISOString(), check_in_latitude: location?.latitude, check_in_longitude: location?.longitude, check_in_accuracy: location?.accuracy }
    : { check_out_at: new Date(state.checkOutAt).toISOString(), check_out_latitude: location?.latitude, check_out_longitude: location?.longitude, check_out_accuracy: location?.accuracy };
  const query = action === "check-in"
    ? supabaseClient.from("attendance").upsert(payload, { onConflict: "employee_id,attendance_date" }).select().single()
    : supabaseClient.from("attendance").update(payload).eq("employee_id", state.currentUserId).eq("attendance_date", today).select().single();
  const { data, error } = await query;
  if (error || !data) throw error || new Error("Attendance was not saved.");
  const index = state.attendanceRows.findIndex(row => row.id === data.id);
  if (index >= 0) state.attendanceRows[index] = data; else state.attendanceRows.unshift(data);
  persistAttendanceRows();
}
function ensureEmployeeProfile(user) {
  if (!user || user.role !== "Employee") return null;
  const id = user.employeeId || user.id;
  user.employeeId = id;
  if (!employeeProfiles[id]) {
    employeeProfiles[id] = { id, name: user.name, role: user.department || "Employee", team: user.department || "General", email: user.username, phone: "—", joined: "23 Sep 2026", salary: "₹0 / month", checkIn: "—", status: "No attendance yet", attendanceSeeded: false };
    persistProfiles();
  } else {
    employeeProfiles[id].name = user.name;
    employeeProfiles[id].email = user.username;
    employeeProfiles[id].team = user.department || employeeProfiles[id].team;
    employeeProfiles[id].role = user.department || employeeProfiles[id].role;
    employeeProfiles[id].salary = employeeProfiles[id].salary || "₹0 / month";
  }
  return employeeProfiles[id];
}
function salaryFor(profile) { return state.salarySettings[profile.id] || { base: Number((profile.salary.match(/[\d,]+/) || ["0"])[0].replace(/,/g, "")), workingDays: 22, overtimeHours: 0, overtimeRate: 0 }; }
function performanceFor(profile) {
  const stats = profileStats(profile);
  const scheduled = Math.max(1, stats.present + stats.late + stats.leave + stats.absent);
  const payable = stats.present + stats.late + stats.leave;
  const salary = salaryFor(profile);
  const perDay = salary.base / salary.workingDays;
  const earned = perDay * payable;
  const deductions = perDay * stats.absent;
  const overtime = salary.overtimeHours * salary.overtimeRate;
  return { ...stats, attendance: ((stats.present + stats.late) / scheduled) * 100, punctuality: ((stats.present) / Math.max(1, stats.present + stats.late)) * 100, payable, scheduled, perDay, earned, deductions, overtime, final: earned - deductions + overtime, average: stats.hours / Math.max(1, stats.present + stats.late) };
}

function getEmployee(id = state.selectedEmployee) { return employeeRoster().find(item => item.id === id) || employeeRoster()[0]; }
function recordFor(profile, day, month = state.selectedMonth) {
  const iso = `${month}-${String(day).padStart(2, "0")}`;
  const attendance = state.attendanceRows.find(row => row.employee_id === profile.id && row.attendance_date === iso);
  if (attendance?.check_in_at) {
    const checkInAt = new Date(attendance.check_in_at).getTime();
    const checkOutAt = attendance.check_out_at ? new Date(attendance.check_out_at).getTime() : null;
    const endAt = checkOutAt || (iso < todayIso() ? cutoffTimestamp(iso) : Date.now());
    const workedMinutes = Math.max(0, Math.round((endAt - checkInAt) / 60000));
    const status = workedMinutes < 360 ? "Half-day" : (attendance.status === "Late" ? "Late" : "Present");
    return { status, checkIn: formatActionTime(checkInAt), checkOut: checkOutAt ? formatActionTime(checkOutAt) : "—", hours: formatMinutes(workedMinutes), reason: status === "Half-day" ? "Worked less than 6 hours" : "" };
  }
  const approvedLeave = state.leaveRequests.find(request => request.employeeId === profile.id && request.status === "Approved" && iso >= request.startDate && iso <= request.endDate);
  if (approvedLeave) return { status: "Leave", checkIn: "—", checkOut: "—", hours: "—", reason: `${approvedLeave.type} leave · ${approvedLeave.reason}` };
  if (iso > todayIso()) return { status: "No record", checkIn: "—", checkOut: "—", hours: "—", reason: "Future date" };
  if (iso === todayIso()) {
    return Date.now() >= cutoffTimestamp(iso) ? { status: "Absent", checkIn: "—", checkOut: "—", hours: "0h", reason: `No check-in by ${displayCutoff()}` } : { status: "No record", checkIn: "—", checkOut: "—", hours: "—", reason: `Attendance day remains open until ${displayCutoff()}` };
  }
  if (profile.attendanceSeeded === false) return { status: "Absent", checkIn: "—", checkOut: "—", hours: "0h", reason: "No check-in recorded" };
  if (profile.id === "SHI-031" && day >= 21 && day <= 23) return { status: "Leave", checkIn: "—", checkOut: "—", hours: "—", reason: "Personal leave · approved" };
  if (profile.id === "SHI-027" && day === 7) return { status: "Leave", checkIn: "—", checkOut: "—", hours: "—", reason: "Medical leave · approved" };
  const today = todayIso();
  const missingCheckIns = (profile.id === "SHI-042" && day === 4) || (profile.id === "SHI-027" && day === 14) || (profile.id === "SHI-009" && day === 10);
  if (iso < today && missingCheckIns) return { status: "Absent", checkIn: "—", checkOut: "—", hours: "0h", reason: "No check-in recorded" };
  const late = (profile.id === "SHI-027" && [2, 9, 16, 23].includes(day)) || (profile.id === "SHI-018" && day === 11);
  const hour = late ? "09:48 AM" : day === 23 && profile.id === "SHI-042" ? "09:14 AM" : "09:0" + ((day % 5) + 1) + " AM";
  return { status: late ? "Late" : "Present", checkIn: hour, checkOut: late ? "06:21 PM" : "06:04 PM", hours: late ? "8h 03m" : "8h 18m", reason: "" };
}
function monthLabel(month) { return new Date(`${month}-01T12:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); }
function monthDays(month) { return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate(); }
function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function normalizeTime(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return "";
  const hours = Number(match[1]), minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function displayCutoff() {
  const normalized = normalizeTime(state.cutoff) || "19:00";
  const [hours, minutes] = normalized.split(":").map(Number);
  const label = new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return label;
}
function cutoffTimestamp(isoDate) {
  const normalized = normalizeTime(state.cutoff) || "19:00";
  return new Date(`${isoDate}T${normalized}:00`).getTime();
}
function dateParts(iso = todayIso()) { const [year, month, day] = iso.split("-"); return { year, month, day: Number(day) }; }
function formatActionTime(timestamp) { return timestamp ? new Date(timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"; }
function workedDuration() {
  if (!state.checkInAt || !state.checkOutAt) return "—";
  const minutes = Math.max(0, Math.round((state.checkOutAt - state.checkInAt) / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
function profileStats(profile) {
  const records = Array.from({ length: monthDays(state.selectedMonth) }, (_, i) => recordFor(profile, i + 1));
  return records.reduce((stats, item) => { const key = item.status === "Half-day" ? "halfDay" : item.status.toLowerCase(); if (Object.prototype.hasOwnProperty.call(stats, key)) stats[key] += 1; if (item.hours !== "—") stats.hours += minutesFromHours(item.hours) / 60; return stats; }, { present: 0, late: 0, halfDay: 0, leave: 0, absent: 0, "no record": 0, hours: 0 });
}
function minutesFromHours(value) {
  if (!value || value === "—") return 0;
  const match = value.match(/(\d+)h(?:\s*(\d+)m)?/);
  return match ? Number(match[1]) * 60 + Number(match[2] || 0) : 0;
}
function formatMinutes(minutes) { return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`; }
function weeklyMinutes(profile) {
  return [17, 18, 19, 20, 21, 22, 23].reduce((total, day) => total + minutesFromHours(recordFor(profile, day, "2026-09").hours), 0);
}
function teamMetrics() {
  const roster = employeeRoster();
  const today = dateParts();
  const records = roster.map(profile => recordFor(profile, today.day, `${today.year}-${today.month}`));
  const present = records.filter(record => record.status === "Present" || record.status === "Late").length;
  const late = records.filter(record => record.status === "Late").length;
  const leave = records.filter(record => record.status === "Leave").length;
  const hours = roster.reduce((total, profile) => total + profileStats(profile).hours, 0);
  const checkedInTimes = roster.map(profile => recordFor(profile, today.day, `${today.year}-${today.month}`).checkIn).filter(time => time !== "—");
  return { present, late, leave, hours, checkedInTimes };
}

function render() {
  captureActiveFormDraft();
  captureUserFormDraft();
  document.querySelector("#app").innerHTML = state.loggedIn ? dashboard() : login();
  bind();
  restoreActiveFormDraft();
  restoreUserFormDraft();
  if (state.loggedIn && !state.refreshTimer) state.refreshTimer = window.setInterval(refreshAttendanceState, 15000);
}

function captureActiveFormDraft() {
  const app = document.querySelector("#app");
  if (!app) return;
  const active = document.activeElement;
  const activeForm = active?.form;
  state.activeFormDraft = {
    forms: Array.from(app.querySelectorAll("form")).map(form => ({
      id: form.id,
      fields: Array.from(form.elements).map((field, index) => ({
        index,
        value: field.value,
        checked: field.checked,
        type: field.type,
        name: field.name,
      })).filter(field => field.name && field.type !== "file"),
    })),
    focus: activeForm ? {
      formId: activeForm.id,
      index: Array.from(activeForm.elements).indexOf(active),
      start: typeof active.selectionStart === "number" ? active.selectionStart : null,
      end: typeof active.selectionEnd === "number" ? active.selectionEnd : null,
    } : null,
  };
}

function restoreActiveFormDraft() {
  const snapshot = state.activeFormDraft;
  if (!snapshot) return;
  snapshot.forms.forEach(savedForm => {
    const form = savedForm.id ? document.getElementById(savedForm.id) : null;
    if (!form) return;
    savedForm.fields.forEach(saved => {
      const field = form.elements[saved.index];
      if (!field || field.name !== saved.name) return;
      if (saved.type === "checkbox" || saved.type === "radio") field.checked = saved.checked;
      else field.value = saved.value;
    });
  });
  if (snapshot.focus?.formId) {
    const form = document.getElementById(snapshot.focus.formId);
    const field = form?.elements[snapshot.focus.index];
    if (field) {
      field.focus({ preventScroll: true });
      if (snapshot.focus.start !== null && typeof field.setSelectionRange === "function") {
        try { field.setSelectionRange(snapshot.focus.start, snapshot.focus.end); } catch { /* Some input types do not support selection ranges. */ }
      }
    }
  }
}

function captureUserFormDraft() {
  if (!state.userModal) return;
  const form = document.querySelector("#user-form");
  if (!form) return;
  state.userFormDraft = {};
  form.querySelectorAll("[name]").forEach(field => {
    if (field.type !== "password") state.userFormDraft[field.name] = field.value;
  });
  const password = form.querySelector('[name="password"]');
  const confirmation = form.querySelector('[name="confirmPassword"]');
  if (password?.value) state.userFormDraft.password = password.value;
  if (confirmation?.value) state.userFormDraft.confirmPassword = confirmation.value;
}

function restoreUserFormDraft() {
  if (!state.userModal || !state.userFormDraft) return;
  const form = document.querySelector("#user-form");
  if (!form) return;
  Object.entries(state.userFormDraft).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (field) field.value = value;
  });
}

function timeGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function login() {
  const helperText = state.role === "employee"
    ? "Use your employee email and password from the local workspace user list."
    : "Use the admin email and password created under User management.";
  return `<div class="shell">
    <section class="brand-panel"><div class="brand-mark">SIGMA HOMES INDIA</div><div class="brand-attribution">A Venture By Jitendra Sharma</div>
      <h1>People who build places that feel like home.</h1><p>Setu is your simple bridge to a more present, productive workday.</p><div class="motto">Built with care · Jaipur · 2026 <small>(Created By Vishesh)</small></div>
    </section>
    <main class="auth-panel"><div class="auth-card"><div class="eyebrow">Welcome to Setu</div><h2>${timeGreeting()}.</h2><p class="intro">Sign in to manage attendance, tasks, and your team’s rhythm.</p>
      <div class="role-switch"><button class="${state.role === "employee" ? "active" : ""}" data-role="employee">Employee</button><button class="${state.role === "admin" ? "active" : ""}" data-role="admin">Admin</button></div>
      <form id="login-form"><label class="field">Work email<input id="login-username" type="email" autocomplete="username" placeholder="" required /></label><label class="field">Password<input id="login-password" type="password" autocomplete="current-password" placeholder="" required /></label><button class="primary">Continue to Setu <span aria-hidden="true">→</span></button><p id="login-error" class="form-error hidden"></p></form>
      <div class="demo-note"><strong>Managed access:</strong> ${helperText}
    </div></main>
  </div>`;
}

function dashboard() {
  const admin = state.role === "admin";
  return `<div class="app-shell"><aside class="sidebar"><div class="brand-mark"><span class="mark">स</span> SETU</div><nav>
    ${nav("overview", "⌂", admin ? "Command centre" : "My overview")}${nav("attendance", "◷", "Attendance")}${nav("tasks", "✓", admin ? "Task assignment" : "My tasks")}${admin ? nav("leaves", "▣", "Leave requests") : ""}${admin ? nav("users", "♙", "User management") : ""}${admin ? nav("settings", "⚙", "Workspace settings") : ""}
  </nav><button class="logout" id="logout">↩ &nbsp; Sign out</button></aside>
  <main class="main">${admin ? adminPage() : employeePage()}</main></div>`;
}
function nav(id, icon, label) { return `<button class="nav-item ${state.page === id ? "active" : ""}" data-page="${id}"><span>${icon}</span>${label}</button>`; }
function header(title, subtitle) {
  const person = state.role === "admin" ? currentUser() : currentEmployee();
  const name = person?.name || person?.full_name || "Administrator";
  const initials = name.split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase();
  const dateLabel = new Date(`${todayIso()}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `<header class="topbar"><div><div class="eyebrow">${dateLabel}</div><h1>${title}</h1><p>${subtitle}</p></div><div class="profile"><div class="avatar">${initials}</div><span>${name}${state.role === "admin" ? " · Admin" : ""}</span></div></header>`;
}

function employeePage() {
  const person = currentEmployee();
  const stats = profileStats(person);
  if (state.page === "attendance") return header("Attendance history", "A clear view of your presence, every day.") + attendanceHistory();
  if (state.page === "tasks") return header("My tasks", "Small steps that move the home forward.") + taskCard(true);
  const checkInTime = formatActionTime(state.checkInAt);
  const checkOutTime = formatActionTime(state.checkOutAt);
  const weekly = weeklyMinutes(person);
  return header(`${timeGreeting()}, ${person.name.split(" ")[0]}`, "Here’s your day at a glance.") + `<section class="grid grid-4">
    <div class="card stat"><span class="label">This month</span><strong>${stats.present + stats.late} days</strong><span class="trend">${stats.present + stats.late ? `${stats.present} present · ${stats.late} late` : "No attendance yet"}</span></div><div class="card stat"><span class="label">Working hours</span><strong>${stats.hours ? `${Math.floor(stats.hours)}h ${String(Math.round((stats.hours % 1) * 60)).padStart(2, "0")}m` : "0h"}</strong><span class="trend">${stats.hours ? "Recorded hours" : "Awaiting first check-in"}</span></div><div class="card stat"><span class="label">On-time streak</span><strong>${stats.present ? `${stats.present} days` : "0 days"}</strong><span class="trend">${stats.present ? "Keep building your streak" : "Starts after check-in"}</span></div><div class="card stat"><span class="label">Leave balance</span><strong>${leaveBalance(person.id)} days</strong><span class="trend">${state.leaveRequests.filter(request => request.employeeId === person.id && request.status === "Pending").length} pending requests</span></div>
  </section><section class="grid grid-2" style="margin-top:18px"><div class="card check-card"><div class="card-title"><h3>Today’s attendance</h3>${locationBadge()}</div>${locationPanel()}<div class="status">${state.checkedIn ? (state.checkedOut ? `Shift complete · ${workedDuration()}` : `Checked in at ${checkInTime} · Working`) : "You haven’t checked in yet"}<br><small>📍 ${activeSite().name} · ${activeSite().address || "Configured site"}</small></div><div class="check-actions"><button class="check-in" id="check-in" ${state.checkedIn || state.location.status === "loading" ? "disabled" : ""}>✓ Check in</button><button class="check-out" id="check-out" ${!state.checkedIn || state.checkedOut || state.location.status === "loading" ? "disabled" : ""}>Check out</button></div></div>
    <div class="card"><div class="card-title"><h3>Today’s timeline</h3><span class="pill ${state.checkedIn ? "green" : "gray"}">${state.checkedIn ? "Active" : "Not started"}</span></div><div class="timeline">${state.checkedIn ? `<div class="timeline-item"><span class="dot"></span><strong>Checked in</strong><span class="time">${checkInTime}</span></div>` : `<div class="timeline-item"><span class="dot" style="background:#d3d7df;box-shadow:none"></span><span>Check-in will appear here</span></div>`}<div class="timeline-item"><span class="dot" style="background:#d3d7df;box-shadow:none"></span><span>Lunch break</span><span class="time">—</span></div>${state.checkedOut ? `<div class="timeline-item"><span class="dot"></span><strong>Checked out</strong><span class="time">${checkOutTime}</span></div>` : `<div class="timeline-item"><span class="dot" style="background:#d3d7df;box-shadow:none"></span><span>Check-out</span><span class="time">—</span></div>`}</div></div></section>
    <section class="grid grid-2" style="margin-top:18px"><div class="card"><div class="card-title"><h3>Weekly working hours</h3><a class="link" data-page="attendance">View report →</a></div><div class="bar-chart">${[17,18,19,20,21,22,23].map((day,i)=>{ const minutes = minutesFromHours(recordFor(person, day, "2026-09").hours); const height = Math.min(100, Math.round((minutes / 480) * 100)); return `<div class="bar ${i === 6 ? "active" : ""}" style="height:${height}%"><small>${["M","T","W","T","F","S","S"][i]}</small></div>`; }).join("")}</div><p style="color:var(--muted);font-size:.78rem;margin:24px 0 0">${formatMinutes(weekly)} this week <strong style="color:var(--navy);float:right">Target 40h</strong></p></div>${taskCard(false)}</section><section class="card leave-card"><div class="card-title"><div><h3>Need time away?</h3><p>Submit a leave request for your manager to review.</p></div><button class="location-button" id="open-leave">Apply for leave</button></div>${employeeLeaveRequests()}</section>${state.leaveModal ? leaveModal() : ""}`;
}

function employeeLeaveRequests() {
  const mine = state.leaveRequests.filter(request => request.employeeId === currentEmployee().id);
  if (!mine.length) return '<p class="empty-state">No leave requests yet.</p>';
  return `<div class="request-list">${mine.slice().reverse().map(request => `<div class="request-row"><span><strong>${request.type}</strong><small>${request.startDate} → ${request.endDate} · ${request.reason}</small></span><span class="pill ${request.status === "Approved" ? "green" : request.status === "Rejected" ? "red" : "orange"}">${request.status}</span></div>`).join("")}</div>`;
}
function leaveModal() {
  return `<div class="modal-backdrop"><form class="modal" id="leave-form"><div class="card-title"><h3>Apply for leave</h3><button type="button" class="modal-close" id="close-leave" aria-label="Close">×</button></div><p class="modal-help">Your manager will review this request. Dates cannot be in the past.</p><label class="field">Leave type<select name="type"><option>Annual leave</option><option>Sick leave</option><option>Personal leave</option><option>Work from home</option></select></label><div class="form-grid"><label class="field">Start date<input name="startDate" type="date" min="${todayIso()}" required></label><label class="field">End date<input name="endDate" type="date" min="${todayIso()}" required></label></div><label class="field">Reason<textarea name="reason" maxlength="160" required placeholder="Add a short reason"></textarea></label><button class="primary">Submit leave request</button></form></div>`;
}

function locationBadge() {
  if (state.location.status === "loading") return '<span class="pill orange">Capturing location</span>';
  if (state.location.status === "error") return '<span class="pill orange">Location unavailable</span>';
  if (state.location.status === "idle") return '<span class="pill gray">Captured on action</span>';
  const site = activeSite();
  if (state.location.distance <= Number(site.radius)) return `<span class="pill green">${state.location.action === "check-out" ? "Check-out location saved" : "Inside assigned site"}</span>`;
  return '<span class="pill orange">Outside radius</span>';
}

function locationPanel() {
  const l = state.location;
  const site = detectedSite();
  if (!site && l.status === "idle") return '<div class="location-panel"><strong>Location captured on check-in and check-out</strong><p>Setu identifies the nearest enabled site from your captured location. No employee site assignment is required.</p></div>';
  if (l.status === "idle") return `<div class="location-panel"><strong>Location captured on check-in and check-out</strong><p>Setu checks your position once when you record each attendance action. Live tracking is not enabled.</p></div>`;
  if (l.status === "loading") return `<div class="location-panel"><strong>Capturing location…</strong><p>Allow location access to record this ${l.action === "check-out" ? "check-out" : "check-in"}.</p></div>`;
  if (!site) return `<div class="location-panel"><strong>No enabled site found</strong><p>${l.error || "Ask an admin to configure at least one enabled site before checking in."}</p></div>`;
  if (l.status === "error") return `<div class="location-panel"><strong>Could not capture location</strong><p>${l.error || "Check your browser permission and try again."}</p></div>`;
  const accuracy = Math.round(l.accuracy);
  const coords = `${l.latitude.toFixed(4)}, ${l.longitude.toFixed(4)}`;
  const range = l.distance < 1000 ? `${Math.round(l.distance)}m from ${site.name}` : `${(l.distance / 1000).toFixed(2)}km from ${site.name}`;
  return `<div class="location-panel"><strong>Location captured for ${l.action === "check-out" ? "check-out" : "check-in"}</strong><p><span class="location-dot"></span>${l.distance <= Number(site.radius) ? "Inside" : "Outside"} ${site.radius}m geofence · ${range}<br><small>Matched site: ${site.name} · radius ${site.radius}m<br>Approx. ${coords} · accuracy ±${accuracy}m</small></p>${l.action === "check-in" && !canCheckIn() ? `<small class="location-warning">${locationRequirementMessage()}</small>` : ""}</div>`;
}

function canCheckIn() {
  const l = state.location;
  const site = detectedSite();
  if (!site) return false;
  const fresh = l.status === "ready" && l.updatedAt;
  const inside = Number.isFinite(l.distance) && l.distance <= Number(site.radius);
  return fresh && inside && isBeforeCutoff();
}

function isBeforeCutoff() {
  return Date.now() <= cutoffTimestamp(todayIso());
}

function locationRequirementMessage() {
  const l = state.location;
  const site = detectedSite();
  if (!site) return "No enabled site was found at your captured location. Ask an admin to configure a site nearby.";
  if (l.status !== "ready") return "Capture your location by pressing check in.";
  if (l.distance > Number(site.radius)) return `You are about ${Math.round(l.distance)}m away from ${site.name}. Check in from within its ${site.radius}m radius.`;
  if (!isBeforeCutoff()) return `The ${displayCutoff()} check-in cutoff has passed. Contact an admin if this is an approved exception.`;
  return "";
}

function captureLocation(action, onSuccess) {
  if (!("geolocation" in navigator)) {
    state.location.status = "error";
    state.location.error = "This browser does not support location capture.";
    render();
    return;
  }
  state.location = { ...state.location, status: "loading", action, error: "" };
  render();
  navigator.geolocation.getCurrentPosition(position => {
    const { latitude, longitude, accuracy } = position.coords;
    const nearest = siteAtLocation(latitude, longitude);
    state.matchedSiteId = nearest?.id || null;
    state.location = { ...state.location, status: "ready", latitude, longitude, accuracy, distance: nearest ? distanceInMetres(latitude, longitude, nearest.latitude, nearest.longitude) : null, updatedAt: Date.now(), error: nearest ? "" : "No enabled site is configured near this location." };
    render();
    onSuccess();
  }, error => {
    state.location.status = "error";
    state.location.error = error.code === 1 ? "Permission was denied. Allow location capture, then try again." : error.code === 2 ? "Your position is currently unavailable. Check GPS/Wi-Fi and retry." : "The location request timed out. Try again.";
    render();
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
}

function recomputeLocationDistance() {
  if (Number.isFinite(state.location.latitude) && Number.isFinite(state.location.longitude)) {
    const site = siteAtLocation();
    state.matchedSiteId = site?.id || null;
    state.location.distance = site ? distanceInMetres(state.location.latitude, state.location.longitude, site.latitude, site.longitude) : null;
  }
}

function distanceInMetres(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function taskCard(full) { const tasks = employeeTasks(currentEmployee().id); return `<div class="card"><div class="card-title"><h3>${full ? "Assigned to you" : "Assigned tasks"}</h3>${!full ? '<a class="link" data-page="tasks">See all →</a>' : ""}</div>${tasks.map(task => `<label class="task"><span><input type="checkbox" data-task-id="${task.id}" ${task.completed ? "checked disabled" : ""}/> ${task.title}</span><span class="pill ${task.completed ? "green" : "orange"}">${task.completed ? "Completed" : task.dueDate === todayIso() ? "Due today" : "In progress"}</span></label>`).join("")}</div>`; }
function attendanceHistory() {
  const profile = state.role === "employee" ? currentEmployee() : getEmployee();
  const stats = profileStats(profile);
  const month = state.selectedMonth;
  const days = Array.from({ length: monthDays(month) }, (_, index) => index + 1);
  return `<div class="card"><div class="card-title"><h3>${monthLabel(month)}</h3><span class="pill green">${stats.present} present · ${stats.halfDay} half-day · ${stats.absent} absent</span></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Day</th><th>Check in</th><th>Check out</th><th>Total</th><th>Status</th></tr></thead><tbody>${days.map(day => { const date = new Date(`${month}-${String(day).padStart(2, "0")}T12:00:00`); const record = recordFor(profile, day, month); return `<tr><td>${String(day).padStart(2, "0")} ${date.toLocaleDateString("en-IN", { month: "short" })}</td><td>${date.toLocaleDateString("en-IN", { weekday: "short" })}</td><td>${record.checkIn}</td><td>${record.checkOut}</td><td>${record.hours}</td><td><span class="pill ${statusClass(record.status)}">${record.status}</span></td></tr>`; }).join("")}</tbody></table></div></div>`;
}

function adminPage() {
  if (state.page === "users") return header("User management", "Control workspace access without exposing passwords.") + userManagement();
  if (state.page === "leaves") return header("Leave requests", "Review and decide employee time-away requests.") + adminLeaveRequests(true);
  if (state.page === "performance") return performanceWorkspace();
  if (state.page === "settings") return header("Workspace settings", "Keep the attendance rules transparent and fair.") + settings();
  if (state.page === "tasks") return header("Task assignment", "Give every team member a clear next step.") + taskAssignment();
  if (state.page === "attendance") return header("Attendance logs", "Review each person’s month, patterns, and payroll-ready hours.") + adminAttendance();
  const metrics = teamMetrics();
  const totalEmployees = employeeRoster().length;
  const attendanceRate = totalEmployees ? ((metrics.present / totalEmployees) * 100).toFixed(1) : "0.0";
  const adminBalance = leaveBalance(currentUser().id);
  return header("Command centre", "Workspace overview") + `<section class="grid grid-4"><div class="card stat"><span class="label">Present today</span><strong>${metrics.present} / ${totalEmployees}</strong><span class="trend">${attendanceRate}% of team</span></div><div class="card stat"><span class="label">Late arrivals</span><strong>${metrics.late}</strong><span class="trend" style="color:#a7521e">From recorded attendance</span></div><div class="card stat"><span class="label">On leave</span><strong>${metrics.leave}</strong><span class="trend">Approved records</span></div><div class="card stat"><span class="label">Your leave balance</span><strong>${adminBalance} days</strong><span class="trend">Your admin account</span></div></section><section class="grid grid-2" style="margin-top:18px"><div class="card"><div class="card-title"><h3>Team attendance</h3><a class="link" data-page="attendance">Full logs →</a></div>${employeeTable()}</div><div class="card"><div class="card-title"><h3>Office pulse</h3><span class="pill green">Calculated locally</span></div><div class="settings"><div class="setting-row"><label>People present today</label><strong style="color:var(--green)">${metrics.present}</strong></div><div class="setting-row"><label>Recorded check-ins</label><strong>${metrics.checkedInTimes.length}</strong></div><div class="setting-row"><label>Working hours this month</label><strong>${formatMinutes(Math.round(metrics.hours * 60))}</strong></div><div class="setting-row"><label>Payroll ready</label><span class="pill orange">Review records</span></div></div></div></section><section class="grid grid-2" style="margin-top:18px"><div class="card">${payroll()}</div><div class="card"><div class="card-title"><h3>Recent activity</h3><a class="link" data-page="attendance">View all →</a></div><div class="timeline">${employeeRoster().slice(0, 3).map(person => { const record = recordFor(person, 23, "2026-09"); return `<div class="timeline-item"><span class="dot"></span><span>${person.name} · ${record.status}</span><span class="time">${record.checkIn}</span></div>`; }).join("")}</div></div></section>`;
}
function userManagement() {
  const editing = users.find(user => user.id === state.userEditingId);
  return `<div class="card"><div class="card-title"><div><h3>Workspace users</h3><p class="settings-help">${supabaseClient ? "Shared accounts must be created in Supabase Authentication, then linked to a profiles row." : "Credentials and leave balances are stored locally for this prototype."}</p></div><button class="print-button" id="new-user">Add user</button></div>${supabaseClient ? '<div class="settings-help" style="margin-bottom:16px">To create a shared login: Supabase → Authentication → Users → Add user. Copy the new user UID into a matching profiles row with role <strong>employee</strong> or <strong>admin</strong>.</div>' : ""}<div class="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Leave balance</th><th>Status</th><th>Site / department</th><th>Actions</th></tr></thead><tbody>${users.map(user => `<tr><td>${user.name}</td><td>${user.username}</td><td>${user.role}</td><td>${user.role === "Employee" ? `<input class="leave-balance-input" data-leave-balance="${user.employeeId || user.id}" type="number" min="0" step="1" value="${leaveBalance(user.employeeId || user.id)}" aria-label="Leave balance for ${user.name}"> days` : "—"}</td><td><span class="pill ${user.status === "Active" ? "green" : "gray"}">${user.status}</span></td><td>${user.department || "—"}<br><small>${state.sites.find(site => site.id === user.siteId)?.name || "—"}</small></td><td><button class="small-button" data-user-action="performance" data-user-id="${user.id}" ${user.role === "Employee" ? "" : "disabled"}>Performance</button><button class="small-button" data-user-action="edit" data-user-id="${user.id}">Edit</button><button class="small-button" data-user-action="toggle" data-user-id="${user.id}">${user.status === "Active" ? "Deactivate" : "Activate"}</button><button class="small-button danger" data-user-action="delete" data-user-id="${user.id}">Delete</button></td></tr>`).join("")}</tbody></table></div></div>${state.userModal ? userForm(editing) : ""}`;
}
function userForm(user) {
  const editing = Boolean(user);
  return `<div class="modal-backdrop"><form class="modal" id="user-form"><div class="card-title"><h3>${editing ? "Edit user" : "Create user"}</h3><button type="button" class="modal-close" id="close-user">×</button></div><div class="form-grid"><label class="field">Full name<input name="name" value="${user?.name || ""}" required></label><label class="field">Username / email<input name="username" type="email" value="${user?.username || ""}" required></label><label class="field">Role<select name="role"><option ${user?.role === "Employee" ? "selected" : ""}>Employee</option><option ${user?.role === "Admin" ? "selected" : ""}>Admin</option></select></label><label class="field">Status<select name="status"><option ${user?.status !== "Inactive" ? "selected" : ""}>Active</option><option ${user?.status === "Inactive" ? "selected" : ""}>Inactive</option></select></label><label class="field">Department<input name="department" value="${user?.department || ""}"></label><label class="field">Leave balance<input name="leaveBalance" type="number" min="0" value="${user ? leaveBalance(user.employeeId || user.id) : 12}"></label><label class="field">Site<select name="siteId"><option value="">No site</option>${state.sites.map(site => `<option value="${site.id}" ${user?.siteId === site.id ? "selected" : ""}>${site.name}</option>`).join("")}</select></label><label class="field">Password${editing ? " (leave blank to keep)" : ""}<span class="password-field"><input name="password" type="password" id="user-password" ${editing ? "" : "required"}><button type="button" class="password-toggle" id="toggle-password">Show</button></span></label><label class="field">Confirm password<span class="password-field"><input name="confirmPassword" type="password" id="user-confirm" ${editing ? "" : "required"}><button type="button" class="password-toggle" id="toggle-confirm">Show</button></span></label></div><p class="modal-help">${supabaseClient ? "This creates a shared Auth account through Supabase." : "Passwords are stored locally for this prototype only."}</p><button class="primary">${editing ? "Save changes" : "Create user"}</button></form></div>`;
}
function performanceWorkspace() {
  const profile = getEmployee(state.performanceEmployeeId);
  if (!profile) return '<div class="card empty-state">No employees yet. Create an employee account in User management to view performance.</div>';
  const p = performanceFor(profile);
  const s = salaryFor(profile);
  const money = value => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return `${header(`${profile.name} · performance`, "Attendance, productivity, and payroll estimate for one employee.")}<div class="performance-toolbar card"><label class="field">Employee<select id="performance-employee">${employeeRoster().map(e => `<option value="${e.id}" ${e.id === profile.id ? "selected" : ""}>${e.name} · ${e.id}</option>`).join("")}</select></label><label class="field">Month<input id="performance-month" type="month" value="${state.selectedMonth}"></label><button class="print-button" id="print-performance">Print statement</button></div><div class="card performance-profile"><div class="detail-header"><div><span class="eyebrow">Employee workspace</span><h2>${profile.name}</h2><p>${profile.role} · ${profile.team} · ${profile.email}</p></div><div class="avatar large">${profile.name.split(" ").map(part => part[0]).join("")}</div></div><div class="grid grid-4 mini-stats"><div><small>Attendance</small><strong>${p.attendance.toFixed(1)}%</strong></div><div><small>Punctuality</small><strong>${p.punctuality.toFixed(1)}%</strong></div><div><small>Working hours</small><strong>${p.hours.toFixed(1)}h</strong></div><div><small>Average daily</small><strong>${p.average.toFixed(1)}h</strong></div></div></div><div class="grid grid-2"><div class="card"><div class="card-title"><h3>Attendance & activity</h3><span class="pill green">${p.present + p.late} payable days</span></div><div class="performance-counts"><span>Present <b>${p.present}</b></span><span>Late <b>${p.late}</b></span><span>Leave <b>${p.leave}</b></span><span>Absent <b>${p.absent}</b></span></div><div class="timeline">${[23,22,21].map(day => { const r = recordFor(profile, day); return `<div class="timeline-item"><span class="dot"></span><span>${day} Sep · ${r.status}</span><span class="time">${r.hours}</span></div>`; }).join("")}</div><div class="task-performance"><strong>Task performance</strong><p>3 assigned · 1 completed · 33% completion</p><div class="progress"><i style="width:33%"></i></div></div></div>${salaryCalculator(profile, p, money)}</div>`;
}
function salaryCalculator(profile, p, money) {
  const s = salaryFor(profile);
  return `<div class="card"><div class="card-title"><h3>Salary calculator</h3><span class="pill orange">Estimate</span></div><p class="settings-help">Prototype assumptions: present, late, and approved leave are payable; absent days are deducted. No statutory deductions or tax are included.</p><div class="salary-fields"><label class="field">Base monthly salary<input id="salary-base" type="number" min="0" value="${s.base}"></label><label class="field">Expected working days<input id="salary-days" type="number" min="1" max="31" value="${s.workingDays}"></label><label class="field">Overtime hours<input id="salary-overtime" type="number" min="0" step=".25" value="${s.overtimeHours}"></label><label class="field">Overtime rate / hour<input id="salary-rate" type="number" min="0" value="${s.overtimeRate}"></label></div><div class="salary-summary"><span>Payable days <b>${p.payable}</b></span><span>Per-day salary <b>${money(p.perDay)}</b></span><span>Earned salary <b>${money(p.earned)}</b></span><span>Absence deductions <b>− ${money(p.deductions)}</b></span><span>Overtime <b>+ ${money(p.overtime)}</b></span><strong>Final estimated salary <b>${money(p.final)}</b></strong></div><button class="primary" id="save-salary">Save salary settings</button></div>`;
}
function performanceStatement() {
  const profile = getEmployee(state.performanceEmployeeId), p = performanceFor(profile), s = salaryFor(profile), money = value => `₹${Math.round(value).toLocaleString("en-IN")}`;
  return `<div class="print-sheet"><div class="sheet-brand"><strong>SETU · SIGMA HOMES INDIA</strong><span>Monthly performance & salary statement</span></div><h1>${monthLabel(state.selectedMonth)}</h1><div class="sheet-info"><span><b>Employee</b>${profile.name}</span><span><b>Role / team</b>${profile.role} · ${profile.team}</span><span><b>Attendance</b>${p.attendance.toFixed(1)}% · ${p.hours.toFixed(1)}h</span><span><b>Payable days</b>${p.payable}</span></div><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody><tr><td>Present / late / leave / absent</td><td>${p.present} / ${p.late} / ${p.leave} / ${p.absent}</td></tr><tr><td>Average daily hours</td><td>${p.average.toFixed(1)}h</td></tr><tr><td>Punctuality</td><td>${p.punctuality.toFixed(1)}%</td></tr><tr><td>Base / earned / deductions</td><td>${money(salaryFor(profile).base)} / ${money(p.earned)} / ${money(p.deductions)}</td></tr><tr><td>Overtime / final estimate</td><td>${money(p.overtime)} / ${money(p.final)}</td></tr><tr><td>Task completion</td><td>1 of 3 · 33%</td></tr></tbody></table><p>Prototype estimate only. Excludes statutory deductions, tax, benefits, approvals, and server-verified payroll inputs.</p></div>`;
}
function employeeTable() { const roster = employeeRoster(); if (!roster.length) return '<p class="empty-state">No employees yet. Create an employee account in User management.</p>'; const today = dateParts(); const month = `${today.year}-${today.month}`; return `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Check in</th><th>Status</th></tr></thead><tbody>${roster.map(e=>{ const record = recordFor(e, today.day, month); return `<tr class="selectable-row" data-employee="${e.id}"><td>${e.name}<br><small style="font-weight:400;color:var(--muted)">${e.team} · ${e.id}</small></td><td>${record.checkIn}</td><td><span class="pill ${statusClass(record.status)}">${record.status}</span></td></tr>`; }).join("")}</tbody></table></div>`; }
function statusClass(status) { return status === "Present" ? "green" : status === "Late" ? "orange" : status === "Half-day" ? "orange" : status === "Leave" ? "blue" : status === "No record" ? "gray" : "red"; }
function adminAttendance() {
  const profile = getEmployee();
  if (!profile) return '<div class="card empty-state">No employees yet. Create an employee account in User management to view attendance.</div>';
  return `<div class="attendance-toolbar card"><label class="field"><span>Employee</span><select id="employee-select">${employeeRoster().map(e => `<option value="${e.id}" ${e.id === profile.id ? "selected" : ""}>${e.name} · ${e.team}</option>`).join("")}</select></label><div class="month-control"><button class="month-button" id="previous-month" aria-label="Previous month">←</button><strong>${monthLabel(state.selectedMonth)}</strong><button class="month-button" id="next-month" aria-label="Next month">→</button></div><button class="print-button" id="print-sheet">Print monthly sheet</button></div>
  <div class="attendance-layout"><div class="card">${employeeTable()}</div>${employeeDetail(profile)}`;
}
function adminLeaveRequests(fullPage = false) {
  const pending = state.leaveRequests.filter(request => request.status === "Pending");
  const history = state.leaveRequests.filter(request => request.status !== "Pending").slice().reverse();
  const rows = pending.map(request => { const person = getEmployee(request.employeeId); return `<div class="request-row"><span><strong>${person.name} · ${request.type}</strong><small>${request.startDate} → ${request.endDate} · ${request.reason}</small></span><span class="request-actions"><button class="approve-button" data-request="${request.id}" data-decision="Approved">Approve</button><button class="reject-button" data-request="${request.id}" data-decision="Rejected">Reject</button></span></div>`; }).join("");
  const historyRows = history.map(request => { const person = getEmployee(request.employeeId); return `<div class="request-row"><span><strong>${person.name} · ${request.type}</strong><small>${request.startDate} → ${request.endDate} · ${request.reason}</small></span><span class="pill ${request.status === "Approved" ? "green" : "red"}">${request.status}</span></div>`; }).join("");
  return `<div class="card leave-requests"><div class="card-title"><div><h3>${fullPage ? "Employee leave requests" : "Leave requests"}</h3><p>Review employee requests; approvals flow into calendars and monthly sheets.</p></div><span class="pill ${pending.length ? "orange" : "green"}">${pending.length} pending</span></div>${pending.length ? `<div class="request-list">${rows}</div>` : '<p class="empty-state">No pending leave requests.</p>'}${fullPage && history.length ? `<div class="card-title" style="margin-top:24px"><h3>Decision history</h3><span class="pill gray">${history.length} reviewed</span></div><div class="request-list">${historyRows}</div>` : ""}</div>`;
}
function employeeDetail(profile) {
  const stats = profileStats(profile);
  const selectedDay = Number(state.selectedDate.slice(-2));
  const selected = recordFor(profile, selectedDay);
  const firstDay = new Date(`${state.selectedMonth}-01T12:00:00`).getDay();
  const cells = Array.from({ length: firstDay }, () => '<div class="calendar-cell blank"></div>');
  for (let day = 1; day <= monthDays(state.selectedMonth); day++) {
    const record = recordFor(profile, day);
    cells.push(`<button class="calendar-cell ${statusClass(record.status)} ${day === selectedDay ? "selected" : ""}" data-day="${day}"><strong>${day}</strong><small>${record.status}</small></button>`);
  }
  while (cells.length % 7) cells.push('<div class="calendar-cell blank"></div>');
  const totalHours = `${Math.floor(stats.hours)}h ${String(Math.round((stats.hours % 1) * 60)).padStart(2, "0")}m`;
  return `<section class="card employee-detail" id="employee-detail"><div class="detail-header"><div><span class="eyebrow">Personal attendance sheet</span><h2>${profile.name}</h2><p>${profile.role} · ${profile.team} · ${profile.id}</p></div><div class="avatar large">${profile.name.split(" ").map(part => part[0]).join("")}</div></div><div class="profile-facts"><span><b>Email</b>${profile.email}</span><span><b>Phone</b>${profile.phone}</span><span><b>Joined</b>${profile.joined}</span><span><b>Salary / rate</b>${profile.salary}</span></div><div class="grid grid-4 mini-stats"><div><small>Present</small><strong>${stats.present}</strong></div><div><small>Late</small><strong>${stats.late}</strong></div><div><small>Leave / absent</small><strong>${stats.leave} / ${stats.absent}</strong></div><div><small>Working hours</small><strong>${totalHours}</strong></div></div><div class="calendar-heading"><h3>${monthLabel(state.selectedMonth)} calendar · 7-day workweek</h3><div class="legend"><span class="legend-green">Present</span><span class="legend-orange">Late / half-day</span><span class="legend-blue">Leave</span><span class="legend-red">Absent</span><span class="legend-gray">No record yet</span></div></div><div class="calendar-weekdays">${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => `<span>${day}</span>`).join("")}</div><div class="calendar-grid">${cells.join("")}</div><div class="selected-day"><div class="card-title"><h3>${new Date(`${state.selectedMonth}-${String(selectedDay).padStart(2, "0")}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</h3><span class="pill ${statusClass(selected.status)}">${selected.status}</span></div><div class="day-facts"><span><b>Check in</b>${selected.checkIn}</span><span><b>Check out</b>${selected.checkOut}</span><span><b>Hours</b>${selected.hours}</span><span><b>Leave / detail</b>${selected.reason || "—"}</span></div></div></section>`;
}
function monthlySheet() {
  const profile = getEmployee();
  const stats = profileStats(profile);
  const rows = Array.from({ length: monthDays(state.selectedMonth) }, (_, i) => { const day = i + 1; const record = recordFor(profile, day); return `<tr><td>${String(day).padStart(2, "0")} ${new Date(`${state.selectedMonth}-${String(day).padStart(2, "0")}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short" })}</td><td>${record.checkIn}</td><td>${record.checkOut}</td><td>${record.hours}</td><td>${record.status}</td><td>${record.reason || "—"}</td></tr>`; }).join("");
  const totalHours = `${Math.floor(stats.hours)}h ${String(Math.round((stats.hours % 1) * 60)).padStart(2, "0")}m`;
  return `<div class="print-sheet"><div class="sheet-brand"><strong>SETU · SIGMA HOMES INDIA</strong><span>Personal monthly attendance sheet</span></div><h1>${monthLabel(state.selectedMonth)}</h1><div class="sheet-info"><span><b>Employee</b>${profile.name}</span><span><b>Role / team</b>${profile.role} · ${profile.team}</span><span><b>Employee ID</b>${profile.id}</span><span><b>Salary / rate</b>${profile.salary}</span></div><table><thead><tr><th>Date</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Status</th><th>Leave reason / details</th></tr></thead><tbody>${rows}</tbody></table><div class="sheet-total"><strong>Monthly totals</strong><span>Present ${stats.present}</span><span>Late ${stats.late}</span><span>Leave ${stats.leave}</span><span>Absent ${stats.absent}</span><span>Total hours ${totalHours}</span><span>Overtime / payroll review: ${(stats.hours > 160 ? Math.round(stats.hours - 160) + "h overtime" : "No overtime")}</span></div></div>`;
}
function payroll() {
  const roster = employeeRoster();
  const gross = roster.reduce((total, profile) => total + Number(salaryFor(profile).base || 0), 0);
  const processed = roster.reduce((total, profile) => {
    const stats = profileStats(profile);
    return total + stats.present + stats.late + stats.leave;
  }, 0);
  const scheduled = roster.length * 22;
  return `<div class="card-title"><h3>Salary & payroll</h3><span class="pill orange">${monthLabel(state.selectedMonth)}</span></div><div class="setting-row"><label>Gross payroll</label><strong>₹${Math.round(gross).toLocaleString("en-IN")}</strong></div><div class="setting-row"><label>Processed attendance</label><strong style="color:var(--green)">${processed} / ${scheduled}</strong></div><div class="setting-row"><label>Next payout</label><strong>30 Sep 2026</strong></div>`;
}
function settings() {
  const editing = state.sites.find(site => site.id === state.siteEditingId) || { id: "", name: "", latitude: "", longitude: "", radius: state.radius, address: "", enabled: true };
  return `<div class="settings-stack"><div class="grid grid-2"><div class="card"><div class="card-title"><h3>Attendance rules</h3><span class="pill green">${supabaseClient ? "Shared" : "Saved locally"}</span></div><div class="settings"><div class="setting-row"><label>Legacy office radius<small style="display:block;color:var(--muted);font-weight:400;margin-top:3px">Used only when no site is configured</small></label><input id="radius" type="number" value="${state.radius}" min="50" max="500"></div><div class="setting-row"><label>Daily attendance cutoff<small style="display:block;color:var(--muted);font-weight:400;margin-top:3px">No check-in by this time marks the day absent; check-in is blocked afterward</small></label><input id="cutoff" type="time" value="${normalizeTime(state.cutoff) || "19:00"}" required></div><button class="primary" id="save-settings">Save rules</button></div></div><div class="card"><div class="card-title"><h3>Location privacy</h3></div><p style="font-size:.83rem;line-height:1.65;color:var(--muted)">Only the employee browser calculates distance in this prototype. The latest position stays in memory, coordinates are rounded on screen, and site settings are stored locally. Production must verify coordinates server-side, minimize retention, secure access, and record consent/audit events.</p></div></div>
  <div class="card site-card"><div class="card-title"><div><h3>Site locations</h3><p class="settings-help">Manage named geofences. The active site is used for employee check-in eligibility.</p></div><span class="pill green">${state.sites.filter(site => site.enabled).length} enabled</span></div><div class="site-list">${state.sites.map(site => `<div class="site-row ${site.id === state.activeSiteId ? "active-site" : ""}"><div class="site-summary"><strong>${site.name}</strong><small>${site.address || "No address label"} · ${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)} · ${site.radius}m radius</small></div><div class="site-actions">${site.id === state.activeSiteId ? '<span class="pill green">Active</span>' : `<button class="small-button" data-site-action="select" data-site-id="${site.id}">Use site</button>`}<button class="small-button" data-site-action="edit" data-site-id="${site.id}">Edit</button><button class="small-button danger" data-site-action="delete" data-site-id="${site.id}" ${state.sites.length <= 1 ? "disabled" : ""}>Delete</button></div></div>`).join("")}</div>
  <form id="site-form" class="site-form"><div class="card-title"><h3>${state.siteEditingId ? "Edit site" : "Add site"}</h3>${state.siteEditingId ? '<button type="button" class="link" id="cancel-site-edit">Cancel</button>' : ""}</div><div class="form-grid"><label class="field">Site name<input name="name" value="${editing.name}" required maxlength="80" placeholder="e.g. Indiranagar design studio"></label><label class="field">Address / label<input name="address" value="${editing.address}" maxlength="140" placeholder="Optional address"></label><label class="field">Latitude<input name="latitude" type="number" step="0.000001" min="-90" max="90" value="${editing.latitude}" required></label><label class="field">Longitude<input name="longitude" type="number" step="0.000001" min="-180" max="180" value="${editing.longitude}" required></label><label class="field">Radius in metres<input name="radius" type="number" min="20" max="5000" value="${editing.radius}" required></label></div><div class="site-form-actions"><button type="button" class="location-button secondary" id="use-current-location">Use my current location</button><button class="primary site-save">${state.siteEditingId ? "Save site changes" : "Add site"}</button></div></form></div>`;
}
function taskAssignment() { const roster = employeeRoster(); if (!roster.length) return '<div class="card empty-state">Create an employee account before assigning tasks.</div>'; return `<div class="card"><div class="card-title"><h3>Assign a task</h3><span class="pill green">${roster.length} employees</span></div><label class="field">Employee<select id="task-employee">${roster.map(person => `<option value="${person.id}">${person.name} · ${person.team}</option>`).join("")}</select></label><label class="field">Task title<input id="task-title" placeholder="e.g. Prepare client walkthrough deck"></label><label class="field">Due date<input id="task-due-date" type="date" value="${todayIso()}"></label><button class="primary" id="assign">Assign task →</button></div>`; }

function toast(message) { const el = document.createElement("div"); el.className = "toast"; el.textContent = message; document.body.appendChild(el); setTimeout(() => el.remove(), 2400); }
function printReport(title, content) {
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (popup) {
    popup.document.write(`<!doctype html><html><head><title>${title}</title><link rel="stylesheet" href="styles.css"></head><body>${content}<script>window.onload=()=>window.print();<\/script></body></html>`);
    popup.document.close();
    return;
  }
  const originalBody = document.body.innerHTML;
  const originalTitle = document.title;
  document.body.innerHTML = content;
  document.title = title;
  const restore = () => {
    document.body.innerHTML = originalBody;
    document.title = originalTitle;
    render();
  };
  window.addEventListener("afterprint", restore, { once: true });
  window.print();
}
function togglePassword(id) { const input = document.querySelector(`#${id}`); const button = input?.nextElementSibling; if (!input || !button) return; input.type = input.type === "password" ? "text" : "password"; button.textContent = input.type === "password" ? "Show" : "Hide"; }
function bind() {
  document.querySelectorAll("[data-role]").forEach(b => b.onclick = () => { state.role = b.dataset.role; render(); });
  document.querySelector("#login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const username = document.querySelector("#login-username").value.trim().toLowerCase();
    const error = document.querySelector("#login-error");
    const password = document.querySelector("#login-password").value;
    if (supabaseClient) {
      const { data, error: authError } = await supabaseClient.auth.signInWithPassword({ email: username, password });
      if (authError || !data.user) {
        error.textContent = authError?.message?.toLowerCase().includes("email not confirmed")
          ? "Confirm this email in Supabase Authentication before signing in."
          : "This email/password is not a Supabase Auth account. Create the user in Supabase Authentication → Users.";
        error.classList.remove("hidden");
        return;
      }
      const { data: profile, error: profileError } = await supabaseClient.from("profiles").select("*").eq("id", data.user.id).single();
      if (profileError || !profile || profile.status !== "Active") {
        await supabaseClient.auth.signOut();
        error.textContent = "Your account is not active in the workspace.";
        error.classList.remove("hidden");
        return;
      }
      state.currentUserId = profile.id;
      state.role = profile.role;
      if (profile.role === "employee") {
        employeeProfiles[profile.id] = { id: profile.id, name: profile.full_name, role: profile.department || "Employee", team: profile.department || "General", email: username, phone: "—", joined: profile.created_at?.slice(0, 10) || "—", salary: "₹0 / month", attendanceSeeded: false };
        state.leaveBalances[profile.id] = profile.leave_balance;
        loadEmployeeSession({ id: profile.id, role: "Employee", employeeId: profile.id });
      } else state.employeeSession = null;
      try {
        await loadSupabaseWorkspace(username);
        subscribeToSharedLeaveRequests();
      } catch (workspaceError) {
        error.textContent = workspaceError.message || "Could not load shared workspace data.";
        error.classList.remove("hidden");
        return;
      }
      state.loggedIn = true; state.page = "overview"; render(); return;
    }
    const passwordUser = users.find(item => item.username.toLowerCase() === username && item.password === password);
    if (!passwordUser || passwordUser.status !== "Active") { error.textContent = !passwordUser ? "Incorrect username or password." : "This account is inactive. Contact an admin."; error.classList.remove("hidden"); return; }
    state.currentUserId = passwordUser.id; state.role = passwordUser.role.toLowerCase();
    if (passwordUser.role === "Employee") { ensureEmployeeProfile(passwordUser); loadEmployeeSession(passwordUser); } else state.employeeSession = null;
    state.loggedIn = true; state.page = "overview"; render();
  });
  document.querySelector("#logout")?.addEventListener("click", async () => { persistEmployeeSession(); if (state.refreshTimer) { clearInterval(state.refreshTimer); state.refreshTimer = null; } if (supabaseClient) await supabaseClient.auth.signOut(); state.currentUserId = null; state.employeeSession = null; state.loggedIn = false; render(); });
  document.querySelectorAll("[data-page]").forEach(b => b.onclick = () => { if (state.role === "employee" && b.dataset.page !== "overview") { state.location.status = "idle"; state.location.updatedAt = null; } state.page = b.dataset.page; render(); });
  document.querySelector("#new-user")?.addEventListener("click", () => { state.userEditingId = null; state.userFormDraft = null; state.userModal = true; render(); });
  document.querySelector("#close-user")?.addEventListener("click", () => { state.userModal = false; state.userEditingId = null; state.userFormDraft = null; render(); });
  document.querySelector("#toggle-password")?.addEventListener("click", () => togglePassword("user-password"));
  document.querySelector("#toggle-confirm")?.addEventListener("click", () => togglePassword("user-confirm"));
  document.querySelector("#user-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const existing = users.find(user => user.id === state.userEditingId);
    const username = form.get("username").toString().trim().toLowerCase();
    const password = form.get("password").toString();
    const confirmation = form.get("confirmPassword").toString();
    if (!form.get("name").toString().trim() || !username || (!existing && !password) || (password && password !== confirmation)) { toast(password !== confirmation ? "Passwords do not match." : "Complete all required fields."); return; }
    if (supabaseClient && !existing && password.length < 8) { toast("Supabase requires passwords to be at least 8 characters."); return; }
    if (users.some(user => user.username.toLowerCase() === username && user.id !== state.userEditingId)) { toast("Username is already in use."); return; }
    if (supabaseClient && !existing) {
      try {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError || !sessionData.session) { toast("Your admin session has expired. Sign in again."); return; }
        const { data: createdUser, error: createError } = await supabaseClient.functions.invoke("create-user", {
          body: { email: username, password, fullName: form.get("name").toString().trim(), role: form.get("role").toString() === "Admin" ? "admin" : "employee", department: form.get("department").toString().trim(), leaveBalance: Number(form.get("leaveBalance")) || 12 },
        });
        if (createError) {
          let detail = createError.message || "Could not create the shared user.";
          const response = createError.context;
          if (response && typeof response.json === "function") {
            try {
              const payload = await response.json();
              if (payload?.error) detail = payload.error;
            } catch {
              // Preserve the SDK error if the function did not return JSON.
            }
          }
          const lowerDetail = detail.toLowerCase();
          if (lowerDetail.includes("not found") || lowerDetail.includes("404")) detail = "The create-user Edge Function is missing. From D:\\Website run: supabase functions deploy create-user --project-ref dtbruclopivjyfskcmjo";
          else if (lowerDetail.includes("only active admins")) detail += " In Supabase Table Editor, verify your profiles row uses role=admin and status=Active.";
          else if (lowerDetail.includes("failed to send a request") || lowerDetail.includes("failed to fetch")) detail = "Could not reach the create-user function. Check the Supabase project URL, publishable key, network, and deployed function.";
          toast(detail);
          return;
        }
        if (!createdUser?.id) { toast("The function returned no user ID. Check create-user Edge Function logs."); return; }
        try { await loadSupabaseWorkspace(); } catch (workspaceError) { toast(workspaceError.message || "User created, but the workspace list could not refresh."); return; }
        state.userModal = false; state.userFormDraft = null; render(); toast("Shared user created successfully.");
        return;
      } catch (error) {
        toast(error.message || "Could not create the shared user. Check the create-user Edge Function logs.");
        return;
      }
    }
    const next = { id: existing?.id || `user-${Date.now()}`, name: form.get("name").toString().trim(), username, role: form.get("role").toString(), status: form.get("status").toString(), department: form.get("department").toString().trim(), siteId: form.get("siteId").toString(), password: password || existing?.password, employeeId: existing?.employeeId || (form.get("role").toString() === "Employee" ? `profile-${Date.now()}` : null) };
    if (existing) Object.assign(existing, next); else users.push(next);
    if (next.role === "Employee") ensureEmployeeProfile(next);
    persistUsers(); state.userModal = false; state.userEditingId = null; state.userFormDraft = null; render(); toast(existing ? "User updated." : "User created.");
  });
  document.querySelectorAll("[data-user-action]").forEach(button => button.onclick = async () => {
    const user = users.find(item => item.id === button.dataset.userId);
    if (!user) return;
    if (button.dataset.userAction === "performance") { state.performanceEmployeeId = user.employeeId || "SHI-042"; state.page = "performance"; render(); return; }
    if (button.dataset.userAction === "edit") { state.userEditingId = user.id; state.userFormDraft = null; state.userModal = true; render(); return; }
    if (button.dataset.userAction === "toggle") { if (user.role === "Admin" && user.status === "Active" && activeAdminCount() <= 1) { toast("Keep at least one active admin."); return; } user.status = user.status === "Active" ? "Inactive" : "Active"; persistUsers(); render(); return; }
    if (button.dataset.userAction === "delete") {
      if (!window.confirm(`Delete ${user.name}? This removes the Supabase Auth account and attendance/profile data. This cannot be undone.`)) return;
      if (user.role === "Admin" && user.status === "Active" && activeAdminCount() <= 1) { toast("The last active admin cannot be deleted."); return; }
      if (supabaseClient) {
        if (!isUuid(user.id)) {
          toast("This is an old browser-only account, not a Supabase Auth user. Refresh the Supabase-linked user list and remove the account from the Supabase dashboard if it still exists there.");
          return;
        }
        const { error } = await supabaseClient.functions.invoke("delete-user", { body: { userId: user.id } });
        if (error) {
          let detail = error.message || "Could not delete the Supabase user.";
          const response = error.context;
          if (response && typeof response.clone === "function") {
            try {
              const payload = await response.clone().json();
              if (payload?.error) detail = payload.error;
            } catch {
              if (response.status === 404) detail = "The delete-user Edge Function is not deployed to this Supabase project.";
            }
          }
          if (detail === "Edge Function returned a non-2xx status code") detail += " Check Supabase → Edge Functions → delete-user → Logs for the server error.";
          toast(detail);
          return;
        }
        try { await loadSupabaseWorkspace(); } catch (refreshError) { toast(refreshError.message || "User deleted, but the list could not refresh."); return; }
        render(); toast("Supabase user deleted.");
        return;
      }
      users.splice(users.indexOf(user), 1); persistUsers(); render(); toast("User deleted locally.");
    }
  });
  document.querySelectorAll("[data-leave-balance]").forEach(input => input.addEventListener("change", async event => {
    const field = event.target;
    const employeeId = field.dataset.leaveBalance;
    const value = Number(field.value);
    const previous = leaveBalance(employeeId);
    if (!Number.isSafeInteger(value) || value < 0) {
      field.value = String(previous);
      toast("Leave balance must be a whole number of zero or more.");
      return;
    }
    if (supabaseClient) {
      const { data: savedBalance, error } = await supabaseClient.rpc("admin_set_leave_balance", {
        target_employee: employeeId,
        new_balance: value,
      });
      if (error || !Number.isSafeInteger(savedBalance)) {
        field.value = String(previous);
        const detail = error?.message || "Supabase did not confirm the updated leave balance.";
        toast(detail.includes("admin_set_leave_balance")
          ? "Apply the latest supabase-schema.sql in Supabase SQL Editor, then retry the leave-balance update."
          : detail);
        return;
      }
      state.leaveBalances[employeeId] = savedBalance;
    } else {
      state.leaveBalances[employeeId] = value;
    }
    persistLeaveBalances();
    field.value = String(value);
    toast(supabaseClient ? "Leave balance saved to Supabase." : "Leave balance saved locally.");
  }));
  document.querySelector("#performance-employee")?.addEventListener("change", event => { state.performanceEmployeeId = event.target.value; render(); });
  document.querySelector("#performance-month")?.addEventListener("change", event => { state.selectedMonth = event.target.value; render(); });
  document.querySelector("#save-salary")?.addEventListener("click", () => {
    const id = state.performanceEmployeeId;
    state.salarySettings[id] = { base: Number(document.querySelector("#salary-base").value), workingDays: Number(document.querySelector("#salary-days").value), overtimeHours: Number(document.querySelector("#salary-overtime").value), overtimeRate: Number(document.querySelector("#salary-rate").value) };
    localStorage.setItem("setuSalarySettings", JSON.stringify(state.salarySettings)); render(); toast("Salary settings saved locally.");
  });
  document.querySelector("#print-performance")?.addEventListener("click", () => {
    printReport(`${getEmployee(state.performanceEmployeeId).name} · ${monthLabel(state.selectedMonth)}`, performanceStatement());
  });
  document.querySelectorAll("[data-employee]").forEach(row => row.onclick = () => { state.selectedEmployee = row.dataset.employee; state.page = "attendance"; render(); });
  document.querySelector("#open-leave")?.addEventListener("click", () => { state.leaveModal = true; render(); });
  document.querySelector("#close-leave")?.addEventListener("click", () => { state.leaveModal = false; render(); });
  document.querySelector("#leave-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const startDate = form.get("startDate").toString();
    const endDate = form.get("endDate").toString();
    const reason = form.get("reason").toString().trim();
    if (!startDate || !endDate || endDate < startDate || !reason) { toast("Choose valid dates and add a reason."); return; }
    const request = { id: `leave-${Date.now()}`, employeeId: currentEmployee().id, type: form.get("type").toString(), startDate, endDate, reason, status: "Pending", submittedAt: new Date().toISOString() };
    if (supabaseClient) {
      const { data: saved, error } = await supabaseClient.from("leave_requests").insert({
        employee_id: request.employeeId,
        leave_type: request.type,
        start_date: request.startDate,
        end_date: request.endDate,
        reason: request.reason,
        status: "Pending",
        deducted_days: 0,
      }).select().single();
      if (error || !saved) { toast(error?.message || "Could not submit the shared leave request."); return; }
      request.id = saved.id;
      request.submittedAt = saved.created_at;
    }
    state.leaveRequests.push(request);
    localStorage.setItem("setuLeaveRequests", JSON.stringify(state.leaveRequests));
    state.leaveModal = false;
    render();
    toast("Leave request submitted for manager review.");
  });
  document.querySelectorAll("[data-request]").forEach(button => button.onclick = () => {
    const handleDecision = async () => {
    const request = state.leaveRequests.find(item => item.id === button.dataset.request);
    if (request) {
      const decision = button.dataset.decision;
      let deductedDays = 0;
      if (decision === "Approved" && request.status === "Pending") {
        const balance = leaveBalance(request.employeeId);
        const days = leaveDays(request);
        if (days > balance) { toast(`Cannot approve ${days} days. The employee has only ${balance} days remaining.`); return; }
        deductedDays = days;
        const nextBalance = balance - days;
        if (supabaseClient) {
          const { data: updatedProfile, error: balanceError } = await supabaseClient
            .from("profiles")
            .update({ leave_balance: nextBalance })
            .eq("id", request.employeeId)
            .select("leave_balance")
            .single();
          if (balanceError || !updatedProfile) {
            toast(balanceError?.message || "Could not update the employee leave balance.");
            return;
          }
          state.leaveBalances[request.employeeId] = updatedProfile.leave_balance;
        } else {
          state.leaveBalances[request.employeeId] = nextBalance;
        }
        persistLeaveBalances();
      }
      if (supabaseClient) {
        const { error } = await supabaseClient.from("leave_requests").update({
          status: decision,
          deducted_days: deductedDays,
          reviewed_by: state.currentUserId,
          reviewed_at: new Date().toISOString(),
        }).eq("id", request.id).eq("status", "Pending");
        if (error) { toast(error.message || "Could not update the shared leave request."); return; }
      }
      request.status = decision;
      request.reviewedAt = new Date().toISOString();
      localStorage.setItem("setuLeaveRequests", JSON.stringify(state.leaveRequests));
      render();
      toast(`Leave request ${request.status.toLowerCase()}.`);
    }
    };
    handleDecision();
  });
  document.querySelector("#employee-select")?.addEventListener("change", event => { state.selectedEmployee = event.target.value; state.selectedDate = `${state.selectedMonth}-23`; render(); });
  document.querySelector("#previous-month")?.addEventListener("click", () => changeMonth(-1));
  document.querySelector("#next-month")?.addEventListener("click", () => changeMonth(1));
  document.querySelectorAll("[data-day]").forEach(day => day.onclick = () => { state.selectedDate = `${state.selectedMonth}-${String(day.dataset.day).padStart(2, "0")}`; render(); });
  document.querySelector("#print-sheet")?.addEventListener("click", () => {
    printReport(`${getEmployee().name} · ${monthLabel(state.selectedMonth)}`, monthlySheet());
  });
  document.querySelector("#check-in")?.addEventListener("click", () => captureLocation("check-in", async () => { if (!canCheckIn()) { toast(locationRequirementMessage()); return; } state.checkInAt = Date.now(); state.checkInLocation = { latitude: state.location.latitude, longitude: state.location.longitude, accuracy: state.location.accuracy, capturedAt: state.checkInAt }; state.checkedIn = true; try { await saveSharedAttendance("check-in"); persistEmployeeSession(); render(); toast(`Checked in at ${formatActionTime(state.checkInAt)} — location captured.`); } catch (error) { state.checkedIn = false; state.checkInAt = null; state.checkInLocation = null; render(); toast(error.message || "Could not save check-in."); } }));
  document.querySelector("#check-out")?.addEventListener("click", () => captureLocation("check-out", async () => { state.checkOutAt = Date.now(); state.checkOutLocation = { latitude: state.location.latitude, longitude: state.location.longitude, accuracy: state.location.accuracy, capturedAt: state.checkOutAt }; state.checkedOut = true; try { await saveSharedAttendance("check-out"); persistEmployeeSession(); render(); toast(`Checked out at ${formatActionTime(state.checkOutAt)} — location captured.`); } catch (error) { state.checkedOut = false; state.checkOutAt = null; state.checkOutLocation = null; render(); toast(error.message || "Could not save check-out."); } }));
  document.querySelectorAll("[data-task-id]").forEach(input => input.onchange = () => { const task = state.tasksByEmployee.find(item => item.id === input.dataset.taskId); if (task && input.checked) { task.completed = true; persistTasks(); render(); toast("Task marked complete."); } });
  document.querySelector("#save-settings")?.addEventListener("click", async () => {
    const radius = Number(document.querySelector("#radius").value);
    const cutoff = normalizeTime(document.querySelector("#cutoff").value);
    if (!cutoff) { toast("Choose a valid daily attendance cutoff time."); return; }
    if (supabaseClient) {
      const { error } = await supabaseClient.from("workspace_settings").upsert({
        id: "default",
        legacy_radius: radius,
        check_in_cutoff: cutoff,
        updated_at: new Date().toISOString(),
      });
      if (error) { toast(`${error.message || "Could not save workspace settings."} Run the latest supabase-schema.sql once in Supabase SQL Editor.`); return; }
    }
    state.radius = radius;
    state.cutoff = cutoff;
    localStorage.setItem("officeRadius", String(radius));
    localStorage.setItem("officeCheckInCutoff", cutoff);
    render();
    toast(supabaseClient ? "Workspace settings saved to Supabase." : "Workspace settings saved locally.");
  });
  document.querySelector("#cancel-site-edit")?.addEventListener("click", () => { state.siteEditingId = null; render(); });
  document.querySelector("#use-current-location")?.addEventListener("click", () => {
    if (!navigator.geolocation) { toast("This browser does not support location."); return; }
    navigator.geolocation.getCurrentPosition(position => {
      const form = document.querySelector("#site-form");
      form.elements.latitude.value = position.coords.latitude.toFixed(6);
      form.elements.longitude.value = position.coords.longitude.toFixed(6);
      toast("Current coordinates filled in. Review and save the site.");
    }, () => toast("Could not read your location. Check browser permission and try again."), { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 });
  });
  document.querySelector("#site-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const site = { id: state.siteEditingId || `site-${Date.now()}`, name: form.get("name").toString().trim(), address: form.get("address").toString().trim(), latitude: Number(form.get("latitude")), longitude: Number(form.get("longitude")), radius: Number(form.get("radius")), enabled: true };
    if (!site.name || !Number.isFinite(site.latitude) || !Number.isFinite(site.longitude) || !Number.isFinite(site.radius) || site.radius < 20 || site.radius > 5000) { toast("Enter a name, valid coordinates, and a radius from 20–5000m."); return; }
    const duplicate = state.sites.find(item => item.name.toLowerCase() === site.name.toLowerCase() && item.id !== site.id);
    if (duplicate) { toast("A site with that name already exists."); return; }
    const index = state.sites.findIndex(item => item.id === site.id);
    if (supabaseClient) {
      const payload = { name: site.name, address: site.address || null, latitude: site.latitude, longitude: site.longitude, radius: site.radius, enabled: site.enabled };
      const result = state.siteEditingId
        ? await supabaseClient.from("sites").update(payload).eq("id", state.siteEditingId).select().single()
        : await supabaseClient.from("sites").insert(payload).select().single();
      if (result.error || !result.data) { toast(result.error?.message || "Could not save the shared site."); return; }
      Object.assign(site, result.data);
    }
    if (index >= 0) state.sites[index] = site; else state.sites.push(site);
    state.activeSiteId = state.activeSiteId || site.id;
    state.siteEditingId = null;
    persistSites();
    recomputeLocationDistance();
    render();
    toast(index >= 0 ? "Site updated locally." : "Site added locally.");
  });
  document.querySelectorAll("[data-site-action]").forEach(button => button.onclick = () => {
    const site = state.sites.find(item => item.id === button.dataset.siteId);
    if (!site) return;
    if (button.dataset.siteAction === "edit") { state.siteEditingId = site.id; render(); }
    if (button.dataset.siteAction === "select") { state.activeSiteId = site.id; persistSites(); recomputeLocationDistance(); render(); toast(`${site.name} is now the active site.`); }
    if (button.dataset.siteAction === "delete") {
      if (state.sites.length <= 1) { toast("Keep at least one site configured."); return; }
      state.sites = state.sites.filter(item => item.id !== site.id);
      if (state.activeSiteId === site.id) state.activeSiteId = state.sites.find(item => item.enabled)?.id || state.sites[0].id;
      persistSites(); recomputeLocationDistance(); render(); toast("Site deleted locally.");
    }
  });
  document.querySelector("#assign")?.addEventListener("click", () => {
    const employeeId = document.querySelector("#task-employee").value;
    const title = document.querySelector("#task-title").value.trim();
    const dueDate = document.querySelector("#task-due-date").value;
    if (!employeeId || !title || !dueDate) { toast("Choose an employee, task title, and due date."); return; }
    state.tasksByEmployee.push({ id: `task-${Date.now()}`, employeeId, title, dueDate, completed: false, createdAt: Date.now() });
    persistTasks();
    render();
    toast("Task assigned successfully.");
  });
}
function changeMonth(offset) {
  const date = new Date(`${state.selectedMonth}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  state.selectedMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  state.selectedDate = `${state.selectedMonth}-01`;
  render();
}
render();

const STORAGE_KEYS = {
  planner: "smartgrade_planner",
  grades: "smartgrade_grades",
  archive: "smartgrade_archive",
  studyLogs: "smartgrade_study_logs",
  settings: "smartgrade_settings",
  schedule: "smartgrade_schedule",
};

const state = {
  planner: [],
  grades: [],
  archive: [],
  studyLogs: [],
  schedule: [],
  settings: {
    darkMode: false,
    prioritySort: true,
  },
  timer: {
    running: false,
    seconds: 0,
    mode: "focus",
    cycle: 1,
    focusDuration: 1500,
    breakDuration: 300,
    currentSubject: "전체 과목",
    intervalId: null,
  },
  activeMemoTarget: null,
  activeMemoType: null,
};

const elements = {
  headerClasses: document.getElementById("header-classes"),
  headerAchievement: document.getElementById("header-achievement"),
  headerFocusTime: document.getElementById("header-focus-time"),
  metricClasses: document.getElementById("metric-classes"),
  metricTasks: document.getElementById("metric-tasks"),
  metricRate: document.getElementById("metric-rate"),
  progressClasses: document.getElementById("progress-classes"),
  progressTasks: document.getElementById("progress-tasks"),
  progressRate: document.getElementById("progress-rate"),
  themeToggle: document.getElementById("theme-toggle"),
  priorityToggle: document.getElementById("priority-toggle"),
  plannerForm: document.getElementById("planner-form"),
  plannerTitle: document.getElementById("planner-title"),
  plannerDue: document.getElementById("planner-due"),
  plannerList: document.getElementById("planner-list"),
  gradeForm: document.getElementById("grade-form"),
  gradeSubject: document.getElementById("grade-subject"),
  gradeCredit: document.getElementById("grade-credit"),
  gradeScore: document.getElementById("grade-score"),
  gradeList: document.getElementById("grade-list"),
  gpaScore: document.getElementById("gpa-score"),
  timerStart: document.getElementById("timer-start"),
  timerReset: document.getElementById("timer-reset"),
  timerFullscreen: document.getElementById("timer-fullscreen"),
  timerDisplay: document.getElementById("timer-display"),
  timerMode: document.getElementById("timer-mode"),
  timerRing: document.getElementById("timer-ring-progress"),
  timerCycle: document.getElementById("timer-cycle"),
  timerSubject: document.getElementById("timer-subject"),
  fullscreenModal: document.getElementById("fullscreen-modal"),
  closeFullscreen: document.getElementById("close-fullscreen"),
  modalTimerDisplay: document.getElementById("modal-timer-display"),
  modalTimerMode: document.getElementById("modal-timer-mode"),
  memoModal: document.getElementById("memo-modal"),
  memoModalTitle: document.getElementById("memo-modal-title"),
  memoText: document.getElementById("memo-text"),
  saveMemo: document.getElementById("save-memo"),
  archiveList: document.getElementById("archive-list"),
  archiveAddFolder: document.getElementById("archive-add-folder"),
  exportData: document.getElementById("export-data"),
  importData: document.getElementById("import-data"),
  importFile: document.getElementById("import-file"),
  clearData: document.getElementById("clear-data"),
  calendarMonth: document.getElementById("calendar-month"),
  calendarGrid: document.getElementById("calendar-grid"),
  calendarEventsList: document.getElementById("calendar-events-list"),
  calendarToday: document.getElementById("calendar-today"),
  prevMonth: document.getElementById("prev-month"),
  nextMonth: document.getElementById("next-month"),
};

let weeklyChart;
let subjectChart;
let currentDate = new Date();

function saveStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function loadStorage(key, fallback) {
  const value = localStorage.getItem(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatDuration(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function getRemainingDays(due) {
  if (!due) return Infinity;
  const now = new Date();
  const dueDate = new Date(due + "T23:59:59");
  const diff = dueDate - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getGradeLabel(value) {
  if (value >= 4) return "A";
  if (value >= 3) return "B";
  return "C";
}

function getGradeClass(value) {
  if (value >= 4) return "green";
  if (value >= 3) return "blue";
  return "orange";
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function loadInitialData() {
  state.planner = loadStorage(STORAGE_KEYS.planner, []);
  state.grades = loadStorage(STORAGE_KEYS.grades, []);
  state.archive = loadStorage(STORAGE_KEYS.archive, []);
  state.studyLogs = loadStorage(STORAGE_KEYS.studyLogs, []);
  state.schedule = loadStorage(STORAGE_KEYS.schedule, [
    { weekday: 1, title: "데이터베이스", time: "10:00" },
    { weekday: 1, title: "웹개발", time: "14:00" },
    { weekday: 3, title: "운영체제", time: "11:00" },
    { weekday: 4, title: "알고리즘", time: "16:00" },
  ]);
  state.settings = loadStorage(STORAGE_KEYS.settings, state.settings);
  if (state.settings.darkMode) document.body.classList.add("dark");
}

function persistState() {
  saveStorage(STORAGE_KEYS.planner, state.planner);
  saveStorage(STORAGE_KEYS.grades, state.grades);
  saveStorage(STORAGE_KEYS.archive, state.archive);
  saveStorage(STORAGE_KEYS.studyLogs, state.studyLogs);
  saveStorage(STORAGE_KEYS.settings, state.settings);
  saveStorage(STORAGE_KEYS.schedule, state.schedule);
}

function setDarkMode(value) {
  state.settings.darkMode = value;
  document.body.classList.toggle("dark", value);
  themeToggle.textContent = value ? "라이트모드" : "다크모드";
  persistState();
}

function updateSummary() {
  const today = new Date();
  const weekday = today.getDay();
  const classCount = state.schedule.filter((item) => item.weekday === weekday).length || 2;
  const upcomingTasks = state.planner.filter((item) => !item.completed).length;
  const completedTasks = state.planner.filter((item) => item.completed).length;
  const totalTasks = state.planner.length;
  const achievement = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const todayMinutes = state.studyLogs
    .filter((item) => item.date === getTodayString())
    .reduce((sum, item) => sum + item.minutes, 0);

  elements.headerClasses.textContent = `${classCount}개`;
  elements.headerAchievement.textContent = `${achievement}%`;
  elements.headerFocusTime.textContent = `${String(Math.floor(todayMinutes / 60)).padStart(2, "0")}:${String(todayMinutes % 60).padStart(2, "0")}`;
  elements.metricClasses.textContent = `${classCount}개`;
  elements.metricTasks.textContent = `${upcomingTasks}개`;
  elements.metricRate.textContent = `${achievement}%`;

  elements.progressClasses.style.width = `${Math.min(100, classCount * 10)}%`;
  elements.progressTasks.style.width = `${Math.min(100, upcomingTasks * 10)}%`;
  elements.progressRate.style.width = `${achievement}%`;
}

function renderPlanner() {
  const items = [...state.planner];
  if (state.settings.prioritySort) {
    items.sort((a, b) => {
      if (a.priority === b.priority) return new Date(a.dueDate) - new Date(b.dueDate);
      return a.priority === "urgent" ? -1 : 1;
    });
  }

  elements.plannerList.innerHTML = items
    .map((item) => {
      const dueDays = getRemainingDays(item.dueDate);
      const tag = dueDays <= 3 ? "urgent" : "normal";
      return `
        <li class="planner-item ${item.completed ? "done" : ""}">
          <div class="item-top">
            <label><input type="checkbox" data-id="${item.id}" class="planner-check" ${item.completed ? "checked" : ""} /> ${item.title}</label>
            <div>
              <span class="badge ${tag}">${tag === "urgent" ? "긴급" : "일반"}</span>
              <button class="file-delete-button planner-delete" data-id="${item.id}">삭제</button>
            </div>
          </div>
          <div class="item-meta">
            <span>${item.dueDate ? `마감일 ${item.dueDate}` : "마감일 미지정"}</span>
            <span>우선순위: ${item.priority === "urgent" ? "높음" : "보통"}</span>
          </div>
        </li>
      `;
    })
    .join("");
}

function renderGrades() {
  elements.gradeList.innerHTML = state.grades
    .map((subject) => {
      const gradeLabel = subject.gradeLabel;
      return `
        <li class="grade-item ${gradeLabel}">
          <div class="item-top">
            <div>
              <strong>${subject.name}</strong>
              <div class="item-meta">
                <span>${subject.credit}학점</span>
                <span>${subject.gradeText}</span>
              </div>
            </div>
            <div>
              <span class="grade-label">${subject.gradeText}</span>
              <button class="file-button grade-memo" data-id="${subject.id}">메모</button>
              <button class="file-delete-button grade-delete" data-id="${subject.id}">삭제</button>
            </div>
          </div>
        </li>
      `;
    })
    .join("");

  const totalCredit = state.grades.reduce((sum, item) => sum + item.credit, 0);
  const totalPoints = state.grades.reduce((sum, item) => sum + item.credit * item.gradeValue, 0);
  const gpa = totalCredit ? (totalPoints / totalCredit).toFixed(2) : "0.00";
  elements.gpaScore.textContent = gpa;
}

function renderArchive() {
  if (!state.archive.length) {
    state.archive = [
      {
        id: createId(),
        name: "1학년 1학기",
        files: [
          { id: createId(), name: "운영체제 노트.pdf", note: "중요 개념 요약", createdAt: getTodayString() },
          { id: createId(), name: "데이터베이스 기말 예상문제.docx", note: "인덱스, 트랜잭션", createdAt: getTodayString() },
        ],
      },
      {
        id: createId(),
        name: "1학년 2학기",
        files: [
          { id: createId(), name: "웹개발 프로젝트 발표.pptx", note: "스크린샷 넣기", createdAt: getTodayString() },
        ],
      },
    ];
    persistState();
  }

  elements.archiveList.innerHTML = state.archive
    .map((folder) => `
      <article class="folder-item" data-foldid="${folder.id}">
        <div class="folder-header">
          <div>
            <h3>${folder.name}</h3>
            <p>${folder.files.length}개 파일</p>
          </div>
          <div>
            <button class="file-button folder-toggle" data-id="${folder.id}">열기</button>
            <button class="folder-delete-button" data-id="${folder.id}">삭제</button>
          </div>
        </div>
        <div class="folder-body hidden" data-bodyid="${folder.id}">
          ${folder.files
            .map(
              (file) => `
                <div class="file-item">
                  <span>${file.name}</span>
                  <button class="file-button file-note" data-folderid="${folder.id}" data-fileid="${file.id}">메모</button>
                  <button class="file-delete-button file-delete" data-folderid="${folder.id}" data-fileid="${file.id}">삭제</button>
                </div>
              `,
            )
            .join("")}
          <div class="item-meta">
            <span>파일 추가</span>
            <button class="outline-button add-file" data-id="${folder.id}">추가</button>
          </div>
        </div>
      </article>
    `)
    .join("");
}

function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const calendar = [];

  for (let i = 0; i < firstDay; i += 1) calendar.push(null);
  for (let day = 1; day <= lastDate; day += 1) calendar.push(new Date(year, month, day));

  elements.calendarMonth.textContent = `${year}년 ${month + 1}월`;
  elements.calendarToday.textContent = `오늘: ${getTodayString()}`;

  elements.calendarGrid.innerHTML = calendar
    .map((date) => {
      if (!date) return `<button class="calendar-cell empty"></button>`;
      const dateKey = formatDate(date);
      const events = state.planner.filter((task) => task.dueDate === dateKey);
      const todayKey = getTodayString();
      const urgent = events.some((task) => getRemainingDays(task.dueDate) <= 3 && !task.completed);
      return `
        <button class="calendar-cell ${dateKey === todayKey ? "today" : ""} ${urgent ? "expire" : ""}" data-date="${dateKey}">
          <span>${date.getDate()}</span>
          <small>${events.length}개</small>
        </button>
      `;
    })
    .join("");

  const selectedDate = getTodayString();
  renderCalendarEvents(selectedDate);
}

function renderCalendarEvents(selectedDate) {
  const events = state.planner.filter((task) => task.dueDate === selectedDate);
  elements.calendarEventsList.innerHTML = events.length
    ? events
        .map(
          (event) => `
            <li class="calendar-event-item">
              <strong>${event.title}</strong>
              <p>${event.completed ? "완료" : "미완료"} • ${event.dueDate}</p>
            </li>
          `,
        )
        .join("")
    : `<li class="calendar-event-item">해당 날짜 일정이 없습니다.</li>`;
}

function updateTimerDisplay() {
  elements.timerDisplay.textContent = formatDuration(state.timer.seconds);
  elements.modalTimerDisplay.textContent = formatDuration(state.timer.seconds);
  elements.timerMode.textContent = state.timer.mode === "focus" ? "집중 모드" : "휴식 모드";
  elements.modalTimerMode.textContent = state.timer.mode === "focus" ? "집중 모드" : "휴식 모드";
  elements.timerCycle.textContent = state.timer.cycle;
  const duration = state.timer.mode === "focus" ? state.timer.focusDuration : state.timer.breakDuration;
  const percent = Math.min(100, (state.timer.seconds / duration) * 100);
  const dash = 452 - (452 * percent) / 100;
  elements.timerRing.style.strokeDashoffset = dash;
}

function notifyUser(message) {
  if (Notification.permission === "granted") {
    new Notification("Smart Grade", { body: message });
  }
}

function beep() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.2);
}

function startTimer() {
  if (state.timer.running) return;
  state.timer.running = true;
  if (Notification.permission !== "granted") Notification.requestPermission();
  elements.timerStart.textContent = "중지";
  state.timer.intervalId = setInterval(() => {
    state.timer.seconds += 1;
    const duration = state.timer.mode === "focus" ? state.timer.focusDuration : state.timer.breakDuration;
    updateTimerDisplay();
    if (state.timer.seconds >= duration) {
      const isFocus = state.timer.mode === "focus";
      if (isFocus) {
        state.studyLogs.push({
          id: createId(),
          date: getTodayString(),
          minutes: Math.round(state.timer.seconds / 60),
          subject: state.timer.currentSubject,
        });
        persistState();
        updateSummary();
        updateCharts();
      }
      beep();
      notifyUser(isFocus ? "집중 시간이 종료되었습니다. 잠시 휴식을 취하세요." : "휴식 시간이 종료되었습니다. 다시 집중하세요.");
      state.timer.seconds = 0;
      if (state.timer.mode === "focus") {
        state.timer.mode = "break";
      } else {
        state.timer.mode = "focus";
        state.timer.cycle += 1;
      }
      updateTimerDisplay();
    }
  }, 1000);
}

function stopTimer() {
  state.timer.running = false;
  elements.timerStart.textContent = "시작";
  clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
}

function resetTimer() {
  stopTimer();
  state.timer.seconds = 0;
  state.timer.mode = "focus";
  state.timer.cycle = 1;
  updateTimerDisplay();
}

function renderTimerSubjects() {
  const subjects = ["전체 과목", ...state.grades.map((item) => item.name)];
  elements.timerSubject.innerHTML = subjects
    .map((subject) => `<option value="${subject}">${subject}</option>`)
    .join("");
  elements.timerSubject.value = state.timer.currentSubject;
}

function collectStudyData() {
  const last7days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = formatDate(date);
    const total = state.studyLogs.filter((item) => item.date === dateKey).reduce((sum, item) => sum + item.minutes, 0);
    last7days.push({ label: `${date.getMonth() + 1}.${date.getDate()}`, minutes: total });
  }
  const subjects = [...new Set(state.studyLogs.map((item) => item.subject))];
  const subjectData = subjects.map((subject) => {
    return {
      label: subject,
      minutes: state.studyLogs.filter((item) => item.subject === subject).reduce((sum, item) => sum + item.minutes, 0),
    };
  });
  return { last7days, subjectData };
}

function updateCharts() {
  const data = collectStudyData();
  const labels = data.last7days.map((item) => item.label);
  const values = data.last7days.map((item) => item.minutes);
  if (weeklyChart) {
    weeklyChart.data.labels = labels;
    weeklyChart.data.datasets[0].data = values;
    weeklyChart.update();
  }
  if (subjectChart) {
    subjectChart.data.labels = data.subjectData.map((item) => item.label);
    subjectChart.data.datasets[0].data = data.subjectData.map((item) => item.minutes);
    subjectChart.update();
  }
}

function initializeCharts() {
  const weeklyCtx = document.getElementById("weekly-chart").getContext("2d");
  const subjectCtx = document.getElementById("subject-chart").getContext("2d");
  const data = collectStudyData();

  weeklyChart = new Chart(weeklyCtx, {
    type: "bar",
    data: {
      labels: data.last7days.map((item) => item.label),
      datasets: [
        {
          label: "공부 시간(분)",
          data: data.last7days.map((item) => item.minutes),
          backgroundColor: "rgba(15, 116, 255, 0.7)",
          borderRadius: 12,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 10 } },
      },
    },
  });

  subjectChart = new Chart(subjectCtx, {
    type: "doughnut",
    data: {
      labels: data.subjectData.map((item) => item.label),
      datasets: [
        {
          data: data.subjectData.map((item) => item.minutes),
          backgroundColor: ["#0f74ff", "#7c3aed", "#16a34a", "#f97316", "#14b8a6"],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });
}

function exportAllData() {
  const payload = {
    planner: state.planner,
    grades: state.grades,
    archive: state.archive,
    studyLogs: state.studyLogs,
    settings: state.settings,
    schedule: state.schedule,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `smartgrade_backup_${getTodayString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importAllData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      state.planner = data.planner || [];
      state.grades = data.grades || [];
      state.archive = data.archive || [];
      state.studyLogs = data.studyLogs || [];
      state.settings = data.settings || state.settings;
      state.schedule = data.schedule || state.schedule;
      if (state.settings.darkMode) document.body.classList.add("dark");
      renderAll();
      persistState();
      alert("데이터가 성공적으로 복원되었습니다.");
    } catch (error) {
      alert("유효한 JSON 파일을 업로드해 주세요.");
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm("전체 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;
  state.planner = [];
  state.grades = [];
  state.archive = [];
  state.studyLogs = [];
  state.settings.prioritySort = true;
  state.timer = { ...state.timer, running: false, seconds: 0, mode: "focus", cycle: 1 };
  state.settings.darkMode = false;
  document.body.classList.remove("dark");
  persistState();
  renderAll();
}

function renderAll() {
  updateSummary();
  renderPlanner();
  renderGrades();
  renderArchive();
  renderCalendar();
  renderTimerSubjects();
  updateTimerDisplay();
  updateCharts();
}

function bindEvents() {
  elements.themeToggle.addEventListener("click", () => setDarkMode(!state.settings.darkMode));
  elements.priorityToggle.addEventListener("click", () => {
    state.settings.prioritySort = !state.settings.prioritySort;
    elements.priorityToggle.classList.toggle("active", state.settings.prioritySort);
    elements.priorityToggle.textContent = state.settings.prioritySort ? "우선순위 ON" : "우선순위 OFF";
    persistState();
    renderPlanner();
  });

  elements.plannerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = elements.plannerTitle.value.trim();
    const due = elements.plannerDue.value;
    if (!title) return;
    const priority = getRemainingDays(due) <= 3 ? "urgent" : "normal";
    state.planner.push({ id: createId(), title, dueDate: due || getTodayString(), completed: false, priority });
    elements.plannerTitle.value = "";
    elements.plannerDue.value = "";
    persistState();
    renderAll();
  });

  elements.plannerList.addEventListener("click", (event) => {
    const target = event.target;
    if (target.matches(".planner-check")) {
      const id = target.dataset.id;
      const item = state.planner.find((task) => task.id === id);
      if (item) {
        item.completed = target.checked;
        persistState();
        renderAll();
      }
    }
    if (target.matches(".planner-delete")) {
      const id = target.dataset.id;
      state.planner = state.planner.filter((task) => task.id !== id);
      persistState();
      renderAll();
    }
  });

  elements.gradeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const subject = elements.gradeSubject.value.trim();
    const credit = Number(elements.gradeCredit.value);
    const gradeValue = Number(elements.gradeScore.value);
    const gradeText = elements.gradeScore.options[elements.gradeScore.selectedIndex].text;
    if (!subject) return;
    state.grades.push({
      id: createId(),
      name: subject,
      credit,
      gradeValue,
      gradeText,
      gradeLabel: getGradeLabel(gradeValue),
      memo: "",
    });
    elements.gradeSubject.value = "";
    persistState();
    renderAll();
  });

  elements.gradeList.addEventListener("click", (event) => {
    const target = event.target;
    if (target.matches(".grade-delete")) {
      const id = target.dataset.id;
      state.grades = state.grades.filter((item) => item.id !== id);
      persistState();
      renderAll();
    }
    if (target.matches(".grade-memo")) {
      const id = target.dataset.id;
      const subject = state.grades.find((item) => item.id === id);
      if (!subject) return;
      state.activeMemoTarget = id;
      state.activeMemoType = "grade";
      elements.memoModalTitle.textContent = `${subject.name} 메모`;
      elements.memoText.value = subject.memo || "";
      elements.memoModal.classList.remove("hidden");
    }
  });

  elements.saveMemo.addEventListener("click", () => {
    const text = elements.memoText.value.trim();
    if (state.activeMemoType === "grade") {
      const subject = state.grades.find((item) => item.id === state.activeMemoTarget);
      if (subject) {
        subject.memo = text;
      }
    }
    if (state.activeMemoType === "file") {
      const [folderId, fileId] = state.activeMemoTarget.split("|");
      const folder = state.archive.find((item) => item.id === folderId);
      const file = folder?.files.find((item) => item.id === fileId);
      if (file) {
        file.note = text;
      }
    }
    persistState();
    elements.memoModal.classList.add("hidden");
    renderAll();
  });

  document.getElementById("close-memo").addEventListener("click", () => {
    elements.memoModal.classList.add("hidden");
  });

  elements.timerStart.addEventListener("click", () => {
    if (state.timer.running) {
      stopTimer();
    } else {
      startTimer();
    }
  });

  elements.timerReset.addEventListener("click", () => {
    resetTimer();
  });

  elements.timerFullscreen.addEventListener("click", () => {
    elements.fullscreenModal.classList.remove("hidden");
  });

  elements.closeFullscreen.addEventListener("click", () => {
    elements.fullscreenModal.classList.add("hidden");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      elements.fullscreenModal.classList.add("hidden");
      elements.memoModal.classList.add("hidden");
    }
  });

  elements.timerSubject.addEventListener("change", (event) => {
    state.timer.currentSubject = event.target.value;
  });

  elements.archiveAddFolder.addEventListener("click", () => {
    const folderName = prompt("새 폴더명을 입력하세요.");
    if (!folderName) return;
    state.archive.push({ id: createId(), name: folderName, files: [] });
    persistState();
    renderArchive();
  });

  elements.archiveList.addEventListener("click", (event) => {
    const target = event.target;
    if (target.matches(".folder-toggle")) {
      const folderId = target.dataset.id;
      const body = document.querySelector(`[data-bodyid='${folderId}']`);
      body.classList.toggle("hidden");
      target.textContent = body.classList.contains("hidden") ? "열기" : "닫기";
    }
    if (target.matches(".folder-delete")) {
      const folderId = target.dataset.id;
      state.archive = state.archive.filter((folder) => folder.id !== folderId);
      persistState();
      renderArchive();
    }
    if (target.matches(".add-file")) {
      const folderId = target.dataset.id;
      const name = prompt("파일명을 입력하세요.");
      if (!name) return;
      const folder = state.archive.find((item) => item.id === folderId);
      folder.files.push({ id: createId(), name, note: "", createdAt: getTodayString() });
      persistState();
      renderArchive();
    }
    if (target.matches(".file-delete")) {
      const folderId = target.dataset.folderid;
      const fileId = target.dataset.fileid;
      const folder = state.archive.find((item) => item.id === folderId);
      folder.files = folder.files.filter((file) => file.id !== fileId);
      persistState();
      renderArchive();
    }
    if (target.matches(".file-note")) {
      const folderId = target.dataset.folderid;
      const fileId = target.dataset.fileid;
      const folder = state.archive.find((item) => item.id === folderId);
      const file = folder?.files.find((item) => item.id === fileId);
      if (!file) return;
      state.activeMemoTarget = `${folderId}|${fileId}`;
      state.activeMemoType = "file";
      elements.memoModalTitle.textContent = `${file.name} 메모`;
      elements.memoText.value = file.note || "";
      elements.memoModal.classList.remove("hidden");
    }
  });

  elements.exportData.addEventListener("click", exportAllData);
  elements.importData.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    importAllData(file);
    elements.importFile.value = "";
  });
  elements.clearData.addEventListener("click", clearAllData);

  elements.calendarGrid.addEventListener("click", (event) => {
    const cell = event.target.closest("button[data-date]");
    if (!cell) return;
    const date = cell.dataset.date;
    renderCalendarEvents(date);
  });

  elements.prevMonth.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });
  elements.nextMonth.addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  document.getElementById("close-fullscreen").addEventListener("click", () => {
    elements.fullscreenModal.classList.add("hidden");
  });
}

function initializeApp() {
  loadInitialData();
  setDarkMode(state.settings.darkMode);
  bindEvents();
  initializeCharts();
  renderAll();
}

initializeApp();

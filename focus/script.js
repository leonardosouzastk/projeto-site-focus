/* ==========================================================================
   FOCUS — script.js
   Vanilla JS, localStorage only. No frameworks, no backend.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  Constants
   * ------------------------------------------------------------------ */
  const STORAGE_KEY = "focusData_v1";
  const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"]; // Dom..Sab
  const WEEKDAY_FULL = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const MONTH_LABELS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const RUN_TYPES = ["Corrida leve", "Longão", "Intervalado", "Tiros", "Outro"];

  /* ------------------------------------------------------------------ *
   *  Data layer
   * ------------------------------------------------------------------ */
  function defaultData() {
    return {
      settings: { name: "", theme: "dark" },
      tasks: [],
      habits: [],
      workouts: [],
      workoutHistory: [],
      runs: []
    };
  }

  let DATA = loadData();

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      const base = defaultData();
      return Object.assign(base, parsed, {
        settings: Object.assign(base.settings, parsed.settings || {})
      });
    } catch (e) {
      console.error("Falha ao carregar dados:", e);
      return defaultData();
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
    } catch (e) {
      console.error("Falha ao salvar dados:", e);
      showToast("Não foi possível salvar os dados.");
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ------------------------------------------------------------------ *
   *  Date helpers
   * ------------------------------------------------------------------ */
  function pad2(n) { return String(n).padStart(2, "0"); }

  function dateToStr(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function todayStr() { return dateToStr(new Date()); }

  function strToDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function weekdayOf(dateStr) { return strToDate(dateStr).getDay(); }

  function formatDateLong(dateStr) {
    const d = strToDate(dateStr);
    const dow = WEEKDAY_FULL[d.getDay()];
    const text = `${dow}, ${d.getDate()} de ${MONTH_LABELS[d.getMonth()]}`;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function formatDateShort(dateStr) {
    const d = strToDate(dateStr);
    return `${pad2(d.getDate())} ${MONTH_LABELS[d.getMonth()].slice(0, 3).toUpperCase()}`;
  }

  function addDays(dateStr, n) {
    const d = strToDate(dateStr);
    d.setDate(d.getDate() + n);
    return dateToStr(d);
  }

  /* ------------------------------------------------------------------ *
   *  Domain logic — day activities / progress
   * ------------------------------------------------------------------ */
  function tasksForDate(dateStr) {
    const wd = weekdayOf(dateStr);
    return DATA.tasks.filter(t => {
      if (t.createdAt && t.createdAt > dateStr) return false;
      if (t.recurring) {
        return !t.days || t.days.length === 0 || t.days.includes(wd);
      }
      return t.date === dateStr;
    });
  }

  function habitsActiveOn(dateStr) {
    return DATA.habits.filter(h => !h.createdAt || h.createdAt <= dateStr);
  }

  function workoutsScheduledOn(dateStr) {
    const wd = weekdayOf(dateStr);
    return DATA.workouts.filter(w => w.days && w.days.length > 0 && w.days.includes(wd));
  }

  function workoutDoneOn(workoutId, dateStr) {
    return DATA.workoutHistory.some(h => h.workoutId === workoutId && h.date === dateStr);
  }

  function anyWorkoutDoneOn(dateStr) {
    return DATA.workoutHistory.some(h => h.date === dateStr);
  }

  function runsOn(dateStr) {
    return DATA.runs.filter(r => r.date === dateStr);
  }

  // Builds the list of "items" that count toward the day's progress.
  function dayItems(dateStr) {
    const items = [];
    tasksForDate(dateStr).forEach(t => {
      items.push({ type: "task", id: t.id, done: (t.completedDates || []).includes(dateStr) });
    });
    habitsActiveOn(dateStr).forEach(h => {
      items.push({ type: "habit", id: h.id, done: (h.completedDates || []).includes(dateStr) });
    });
    workoutsScheduledOn(dateStr).forEach(w => {
      items.push({ type: "workout", id: w.id, done: workoutDoneOn(w.id, dateStr) });
    });
    if (runsOn(dateStr).length > 0) {
      items.push({ type: "run", id: "run-" + dateStr, done: true });
    }
    return items;
  }

  function dayProgress(dateStr) {
    const items = dayItems(dateStr);
    const done = items.filter(i => i.done).length;
    const total = items.length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { done, total, pct, items };
  }

  function isProductiveDay(dateStr) {
    return dayProgress(dateStr).done > 0;
  }

  function habitStreak(habit, referenceDateStr) {
    let streak = 0;
    let cursor = referenceDateStr;
    const doneSet = new Set(habit.completedDates || []);
    // if today not done yet, streak counts up to yesterday
    if (!doneSet.has(cursor)) {
      cursor = addDays(cursor, -1);
    }
    while (doneSet.has(cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  /* ------------------------------------------------------------------ *
   *  Navigation
   * ------------------------------------------------------------------ */
  const screens = Array.from(document.querySelectorAll(".screen"));
  const navItems = Array.from(document.querySelectorAll(".nav-item"));

  function goToScreen(name, opts) {
    opts = opts || {};
    screens.forEach(s => {
      const active = s.id === "screen-" + name;
      s.dataset.active = active ? "true" : "false";
    });
    navItems.forEach(b => {
      b.dataset.navActive = b.dataset.screen === name ? "true" : "false";
    });
    if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    renderScreen(name);
  }

  function currentScreenName() {
    const el = screens.find(s => s.dataset.active === "true");
    return el ? el.id.replace("screen-", "") : "home";
  }

  document.querySelectorAll("[data-screen]").forEach(el => {
    el.addEventListener("click", () => goToScreen(el.dataset.screen));
  });

  function renderScreen(name) {
    if (name === "home") renderHome();
    else if (name === "rotina") renderRotina();
    else if (name === "treinos") renderTreinos();
    else if (name === "corrida") renderCorrida();
    else if (name === "progresso") renderProgresso();
    else if (name === "config") renderConfig();
  }

  /* ------------------------------------------------------------------ *
   *  Modal helpers
   * ------------------------------------------------------------------ */
  const modalBackdrop = document.getElementById("modalBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", e => { if (e.target === modalBackdrop) closeModal(); });

  function openModal(title, node) {
    modalTitle.textContent = title;
    modalBody.innerHTML = "";
    modalBody.appendChild(node);
    modalBackdrop.hidden = false;
  }
  function closeModal() {
    modalBackdrop.hidden = true;
    modalBody.innerHTML = "";
  }

  function el(tag, attrs, children) {
    const e = tag === "svg"
      ? document.createElementNS("http://www.w3.org/2000/svg", "svg")
      : document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(k => {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(c => { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  let toastTimer = null;
  function showToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  function confirmModal(message, onConfirm, confirmLabel) {
    const wrap = el("div", {}, [
      el("p", { style: "font-size:14.5px;color:var(--text-muted);line-height:1.6;margin-bottom:18px;" }, [message]),
      el("div", { style: "display:flex;gap:10px;" }, [
        el("button", { class: "btn btn-small", style: "flex:1;", onclick: closeModal }, ["Cancelar"]),
        el("button", { class: "btn btn-danger", style: "flex:1;", onclick: () => { onConfirm(); closeModal(); } }, [confirmLabel || "Confirmar"])
      ])
    ]);
    openModal("Confirmar ação", wrap);
  }

  /* ------------------------------------------------------------------ *
   *  HOME
   * ------------------------------------------------------------------ */
  function greetingWord() {
    const h = new Date().getHours();
    if (h < 5) return "Boa noite";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  }

  function renderHome() {
    const today = todayStr();
    document.getElementById("greetDate").textContent = formatDateLong(today);
    const name = DATA.settings.name && DATA.settings.name.trim();
    document.getElementById("greetTitle").textContent = greetingWord() + (name ? `, ${name}` : "");

    const prog = dayProgress(today);
    document.getElementById("homeProgressFrac").textContent = `${prog.done} / ${prog.total}`;
    document.getElementById("homeProgressFill").style.width = prog.pct + "%";
    const msgEl = document.getElementById("homeProgressMsg");
    if (prog.total === 0) msgEl.textContent = "Nada planejado para hoje ainda.";
    else if (prog.pct >= 100) msgEl.textContent = "Dia completo. Bom trabalho!";
    else if (prog.pct >= 50) msgEl.textContent = "Você já está na metade do dia.";
    else msgEl.textContent = "Vamos começar!";

    // tasks
    const tasks = tasksForDate(today);
    const taskListEl = document.getElementById("homeTaskList");
    taskListEl.innerHTML = "";
    tasks.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    tasks.forEach(t => taskListEl.appendChild(renderCheckItem(t, today, "task")));
    document.getElementById("homeTaskEmpty").hidden = tasks.length > 0;

    // workout
    const scheduled = workoutsScheduledOn(today);
    const workoutCard = document.getElementById("homeWorkoutCard");
    if (scheduled.length > 0) {
      const w = scheduled[0];
      workoutCard.hidden = false;
      document.getElementById("homeWorkoutName").textContent = w.name;
      const done = workoutDoneOn(w.id, today);
      document.getElementById("homeWorkoutMeta").textContent = done
        ? "Concluído hoje ✓"
        : `${w.exercises.length} exercício${w.exercises.length === 1 ? "" : "s"}`;
      const btn = document.getElementById("homeStartWorkoutBtn");
      btn.textContent = done ? "Refazer treino" : "Começar treino";
      btn.onclick = () => startWorkoutExecution(w.id);
    } else {
      workoutCard.hidden = true;
    }

    // run
    const runsToday = runsOn(today);
    const runCard = document.getElementById("homeRunCard");
    if (runsToday.length > 0) {
      runCard.hidden = false;
      const r = runsToday[runsToday.length - 1];
      document.getElementById("homeRunDist").textContent = formatKm(r.distance) + " km";
      document.getElementById("homeRunMeta").textContent = `${r.time} • ${paceStr(r.distance, r.time)}/km`;
    } else {
      runCard.hidden = true;
    }

    // habits
    const habits = habitsActiveOn(today);
    const habitListEl = document.getElementById("homeHabitList");
    habitListEl.innerHTML = "";
    habits.forEach(h => habitListEl.appendChild(renderHabitChip(h, today)));
    document.getElementById("homeHabitEmpty").hidden = habits.length > 0;
  }

  function renderCheckItem(task, dateStr, kind) {
    const done = (task.completedDates || []).includes(dateStr);
    const li = el("li", { class: "check-item", "data-done": done ? "true" : "false" });
    const box = el("button", { class: "checkbox", "aria-label": "marcar concluído" }, [
      el("svg", { viewBox: "0 0 24 24", width: "14", height: "14", html: '<path d="M5 12.5 9.5 17 19 7" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' })
    ]);
    box.addEventListener("click", () => {
      toggleTaskDone(task.id, dateStr);
    });
    li.appendChild(box);
    if (task.time) li.appendChild(el("span", { class: "check-time" }, [task.time]));
    li.appendChild(el("span", { class: "check-name" }, [task.name]));
    return li;
  }

  function toggleTaskDone(taskId, dateStr) {
    const t = DATA.tasks.find(x => x.id === taskId);
    if (!t) return;
    t.completedDates = t.completedDates || [];
    const idx = t.completedDates.indexOf(dateStr);
    if (idx >= 0) t.completedDates.splice(idx, 1);
    else t.completedDates.push(dateStr);
    saveData();
    renderScreen(currentScreenName());
  }

  function renderHabitChip(habit, dateStr) {
    const done = (habit.completedDates || []).includes(dateStr);
    const streak = habitStreak(habit, dateStr);
    const chip = el("li", { class: "habit-chip", "data-done": done ? "true" : "false" });
    const dot = el("span", { class: "habit-dot" });
    chip.appendChild(dot);
    chip.appendChild(el("span", {}, [habit.name]));
    if (streak > 0) chip.appendChild(el("span", { class: "streak" }, [`🔥 ${streak}`]));
    chip.addEventListener("click", () => toggleHabitDone(habit.id, dateStr));
    return chip;
  }

  function toggleHabitDone(habitId, dateStr) {
    const h = DATA.habits.find(x => x.id === habitId);
    if (!h) return;
    h.completedDates = h.completedDates || [];
    const idx = h.completedDates.indexOf(dateStr);
    if (idx >= 0) h.completedDates.splice(idx, 1);
    else h.completedDates.push(dateStr);
    saveData();
    renderScreen(currentScreenName());
  }

  /* ------------------------------------------------------------------ *
   *  ROTINA (tasks + habits)
   * ------------------------------------------------------------------ */
  document.getElementById("rotinaTabs").addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    document.querySelectorAll("#rotinaTabs .seg-btn").forEach(b => b.dataset.segActive = "false");
    btn.dataset.segActive = "true";
    const tab = btn.dataset.tab;
    document.getElementById("rotinaTarefas").hidden = tab !== "tarefas";
    document.getElementById("rotinaHabitos").hidden = tab !== "habitos";
  });

  function renderRotina() {
    const today = todayStr();
    const taskListEl = document.getElementById("taskList");
    taskListEl.innerHTML = "";
    const tasksSorted = [...DATA.tasks].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
    tasksSorted.forEach(t => taskListEl.appendChild(renderTaskRow(t, today)));
    document.getElementById("taskListEmpty").hidden = DATA.tasks.length > 0;

    const habitListEl = document.getElementById("habitList");
    habitListEl.innerHTML = "";
    DATA.habits.forEach(h => habitListEl.appendChild(renderHabitRow(h, today)));
    document.getElementById("habitListEmpty").hidden = DATA.habits.length > 0;
  }

  function renderTaskRow(task, today) {
    const done = (task.completedDates || []).includes(today);
    const li = el("li", { class: "list-card" });
    const box = el("button", { class: "checkbox", "data-done": done ? "true" : "false" }, [
      el("svg", { viewBox: "0 0 24 24", width: "14", height: "14", html: '<path d="M5 12.5 9.5 17 19 7" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' })
    ]);
    box.addEventListener("click", () => toggleTaskDone(task.id, today));

    const main = el("div", { class: "list-card-main" });
    main.appendChild(el("p", { class: "list-card-title" }, [task.name]));
    const subParts = [];
    if (task.time) subParts.push(task.time);
    subParts.push(task.recurring ? "recorrente" : "hoje");
    main.appendChild(el("p", { class: "list-card-sub" }, [subParts.join(" • ")]));
    if (task.recurring) {
      const tags = el("div", { class: "day-tags" });
      WEEKDAY_LABELS.forEach((lbl, i) => {
        const on = !task.days || task.days.length === 0 || task.days.includes(i);
        tags.appendChild(el("span", { class: "day-tag", "data-on": on ? "true" : "false" }, [lbl]));
      });
      main.appendChild(tags);
    }

    const actions = el("div", { class: "list-card-actions" }, [
      iconEditBtn(() => openTaskModal(task)),
      iconDeleteBtn(() => confirmModal(`Excluir a tarefa "${task.name}"?`, () => {
        DATA.tasks = DATA.tasks.filter(t => t.id !== task.id);
        saveData(); renderRotina();
      }))
    ]);

    li.appendChild(box);
    li.appendChild(main);
    li.appendChild(actions);
    return li;
  }

  function renderHabitRow(habit, today) {
    const done = (habit.completedDates || []).includes(today);
    const streak = habitStreak(habit, today);
    const li = el("li", { class: "list-card" });
    const box = el("button", { class: "checkbox", "data-done": done ? "true" : "false" }, [
      el("svg", { viewBox: "0 0 24 24", width: "14", height: "14", html: '<path d="M5 12.5 9.5 17 19 7" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' })
    ]);
    box.addEventListener("click", () => toggleHabitDone(habit.id, today));

    const main = el("div", { class: "list-card-main" });
    main.appendChild(el("p", { class: "list-card-title" }, [habit.name]));
    main.appendChild(el("p", { class: "list-card-sub" }, [done ? "Concluído hoje" : "Ainda não feito hoje"]));

    const badge = el("span", { class: "streak-badge", "data-hot": streak >= 3 ? "true" : "false" }, [`🔥 ${streak} dia${streak === 1 ? "" : "s"}`]);

    const actions = el("div", { class: "list-card-actions" }, [
      iconEditBtn(() => openHabitModal(habit)),
      iconDeleteBtn(() => confirmModal(`Excluir o hábito "${habit.name}"?`, () => {
        DATA.habits = DATA.habits.filter(h => h.id !== habit.id);
        saveData(); renderRotina();
      }))
    ]);

    li.appendChild(box);
    li.appendChild(main);
    li.appendChild(badge);
    li.appendChild(actions);
    return li;
  }

  function iconEditBtn(onClick) {
    return el("button", { class: "icon-btn", style: "width:32px;height:32px;", onclick: onClick, "aria-label": "editar" }, [
      el("svg", { viewBox: "0 0 24 24", width: "15", height: "15", html: '<path d="M4 20h4L18 10l-4-4L4 16v4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' })
    ]);
  }
  function iconDeleteBtn(onClick) {
    return el("button", { class: "icon-btn", style: "width:32px;height:32px;color:var(--danger);", onclick: onClick, "aria-label": "excluir" }, [
      el("svg", { viewBox: "0 0 24 24", width: "15", height: "15", html: '<path d="M6 7h12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' })
    ]);
  }

  document.getElementById("addTaskBtn").addEventListener("click", () => openTaskModal(null));
  document.getElementById("addHabitBtn").addEventListener("click", () => openHabitModal(null));

  function openTaskModal(existing) {
    const nameInput = el("input", { class: "input", type: "text", placeholder: "Nome da tarefa", value: existing ? existing.name : "" });
    const timeInput = el("input", { class: "input", type: "time", value: existing ? (existing.time || "") : "" });
    let recurring = existing ? !!existing.recurring : true;
    let days = existing && existing.days ? [...existing.days] : [];

    const recToggle = el("div", { class: "toggle", "data-on": recurring ? "true" : "false" });
    recToggle.addEventListener("click", () => {
      recurring = !recurring;
      recToggle.dataset.on = recurring ? "true" : "false";
      dayPicker.style.display = recurring ? "flex" : "none";
    });

    const dayPicker = el("div", { class: "weekday-picker", style: recurring ? "" : "display:none;" });
    WEEKDAY_LABELS.forEach((lbl, i) => {
      const btn = el("button", { type: "button", class: "weekday-btn", "data-on": days.includes(i) ? "true" : "false" }, [lbl]);
      btn.addEventListener("click", () => {
        const on = btn.dataset.on === "true";
        if (on) { days = days.filter(d => d !== i); btn.dataset.on = "false"; }
        else { days.push(i); btn.dataset.on = "true"; }
      });
      dayPicker.appendChild(btn);
    });

    const saveBtn = el("button", { class: "btn btn-primary btn-block" }, [existing ? "Salvar alterações" : "Adicionar tarefa"]);
    saveBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) { showToast("Digite um nome para a tarefa."); return; }
      if (existing) {
        existing.name = name;
        existing.time = timeInput.value || "";
        existing.recurring = recurring;
        existing.days = recurring ? days : [];
        if (!recurring) existing.date = existing.date || todayStr();
      } else {
        DATA.tasks.push({
          id: uid(), name, time: timeInput.value || "",
          recurring, days: recurring ? days : [],
          date: recurring ? null : todayStr(),
          createdAt: todayStr(),
          completedDates: []
        });
      }
      saveData();
      closeModal();
      renderScreen(currentScreenName());
      showToast(existing ? "Tarefa atualizada." : "Tarefa adicionada.");
    });

    const wrap = el("div", {}, [
      el("label", { class: "field-label" }, ["Nome"]),
      nameInput,
      el("label", { class: "field-label" }, ["Horário (opcional)"]),
      timeInput,
      el("div", { class: "check-row" }, [recToggle, el("label", {}, ["Recorrente"])]),
      dayPicker,
      saveBtn
    ]);
    openModal(existing ? "Editar tarefa" : "Nova tarefa", wrap);
  }

  function openHabitModal(existing) {
    const nameInput = el("input", { class: "input", type: "text", placeholder: "Nome do hábito", value: existing ? existing.name : "" });
    const saveBtn = el("button", { class: "btn btn-primary btn-block" }, [existing ? "Salvar alterações" : "Adicionar hábito"]);
    saveBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      if (!name) { showToast("Digite um nome para o hábito."); return; }
      if (existing) existing.name = name;
      else DATA.habits.push({ id: uid(), name, createdAt: todayStr(), completedDates: [] });
      saveData();
      closeModal();
      renderScreen(currentScreenName());
      showToast(existing ? "Hábito atualizado." : "Hábito adicionado.");
    });
    const wrap = el("div", {}, [
      el("label", { class: "field-label" }, ["Nome"]),
      nameInput,
      saveBtn
    ]);
    openModal(existing ? "Editar hábito" : "Novo hábito", wrap);
  }

  /* ------------------------------------------------------------------ *
   *  TREINOS — lista + histórico
   * ------------------------------------------------------------------ */
  function renderTreinos() {
    const listEl = document.getElementById("workoutList");
    listEl.innerHTML = "";
    DATA.workouts.forEach(w => listEl.appendChild(renderWorkoutRow(w)));
    document.getElementById("workoutListEmpty").hidden = DATA.workouts.length > 0;

    const histEl = document.getElementById("workoutHistoryList");
    histEl.innerHTML = "";
    const hist = [...DATA.workoutHistory].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
    hist.forEach(h => histEl.appendChild(renderHistoryItem(h)));
    document.getElementById("workoutHistoryEmpty").hidden = hist.length > 0;
  }

  function renderWorkoutRow(w) {
    const li = el("li", { class: "list-card" });
    li.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      startWorkoutExecution(w.id);
    });
    const top = el("div", { class: "workout-row-top" }, [
      el("p", { class: "list-card-title" }, [w.name]),
      el("div", { class: "workout-row-actions" }, [
        iconEditBtn((e) => { e.stopPropagation(); openWorkoutEditor(w.id); }),
        iconDeleteBtn((e) => { e.stopPropagation(); confirmModal(`Excluir o treino "${w.name}"?`, () => {
          DATA.workouts = DATA.workouts.filter(x => x.id !== w.id);
          saveData(); renderTreinos();
        }); })
      ])
    ]);
    li.appendChild(top);
    let sub = `${w.exercises.length} exercício${w.exercises.length === 1 ? "" : "s"}`;
    if (w.days && w.days.length) sub += " • " + w.days.map(d => WEEKDAY_LABELS[d]).join(" ");
    li.appendChild(el("p", { class: "list-card-sub" }, [sub]));
    return li;
  }

  function renderHistoryItem(h) {
    const item = el("div", { class: "history-item" });
    item.appendChild(el("div", { class: "history-top" }, [
      el("span", { class: "history-name" }, [h.workoutName]),
      el("span", { class: "history-date" }, [formatDateShort(h.date)])
    ]));
    const lines = h.exercises.map(ex => {
      const doneSets = ex.sets.filter(s => s.done).length;
      return `${ex.name} — ${doneSets}/${ex.sets.length} séries`;
    });
    item.appendChild(el("p", { class: "history-exercises" }, [lines.join(" · ")]));
    return item;
  }

  document.getElementById("addWorkoutBtn").addEventListener("click", () => openWorkoutEditor(null));

  /* ---------- editor de treino ---------- */
  let editingWorkout = null; // { id, name, days, exercises: [...] }

  function openWorkoutEditor(workoutId) {
    if (workoutId) {
      const w = DATA.workouts.find(x => x.id === workoutId);
      editingWorkout = JSON.parse(JSON.stringify(w));
    } else {
      editingWorkout = { id: null, name: "", days: [], exercises: [] };
    }
    document.getElementById("editWorkoutTitle").textContent = workoutId ? "Editar treino" : "Novo treino";
    document.getElementById("workoutNameInput").value = editingWorkout.name;
    document.getElementById("deleteWorkoutBtn").hidden = !workoutId;
    renderWeekdayPicker();
    renderExerciseEditorList();
    goToScreen("editar-treino");
  }

  function renderWeekdayPicker() {
    const picker = document.getElementById("workoutDaysPicker");
    picker.innerHTML = "";
    WEEKDAY_LABELS.forEach((lbl, i) => {
      const btn = el("button", { type: "button", class: "weekday-btn", "data-on": editingWorkout.days.includes(i) ? "true" : "false" }, [lbl]);
      btn.addEventListener("click", () => {
        const on = btn.dataset.on === "true";
        if (on) { editingWorkout.days = editingWorkout.days.filter(d => d !== i); btn.dataset.on = "false"; }
        else { editingWorkout.days.push(i); btn.dataset.on = "true"; }
      });
      picker.appendChild(btn);
    });
  }

  function renderExerciseEditorList() {
    const list = document.getElementById("exerciseList");
    list.innerHTML = "";
    if (editingWorkout.exercises.length === 0) {
      list.appendChild(el("p", { class: "empty-hint" }, ["Nenhum exercício adicionado ainda."]));
    }
    editingWorkout.exercises.forEach((ex, idx) => {
      const item = el("div", { class: "exercise-item" });
      item.appendChild(el("div", { class: "exercise-item-top" }, [
        el("span", { class: "exercise-item-name" }, [ex.name]),
        el("div", {}, [
          iconEditBtn(() => openExerciseModal(idx)),
          iconDeleteBtn(() => { editingWorkout.exercises.splice(idx, 1); renderExerciseEditorList(); })
        ])
      ]));
      item.appendChild(el("p", { class: "exercise-item-meta" }, [`${ex.sets} séries × ${ex.reps} rep · ${ex.weight} kg`]));
      list.appendChild(item);
    });
  }

  document.getElementById("addExerciseBtn").addEventListener("click", () => openExerciseModal(null));

  function openExerciseModal(idx) {
    const existing = idx !== null ? editingWorkout.exercises[idx] : null;
    const nameInput = el("input", { class: "input", type: "text", placeholder: "Ex: Supino reto", value: existing ? existing.name : "" });
    const setsInput = el("input", { class: "input", type: "number", min: "1", placeholder: "Séries", value: existing ? existing.sets : "3" });
    const repsInput = el("input", { class: "input", type: "number", min: "1", placeholder: "Repetições", value: existing ? existing.reps : "10" });
    const weightInput = el("input", { class: "input", type: "number", min: "0", step: "0.5", placeholder: "Peso (kg)", value: existing ? existing.weight : "" });
    const saveBtn = el("button", { class: "btn btn-primary btn-block" }, [existing ? "Salvar exercício" : "Adicionar exercício"]);
    saveBtn.addEventListener("click", () => {
      const name = nameInput.value.trim();
      const sets = parseInt(setsInput.value, 10) || 1;
      const reps = parseInt(repsInput.value, 10) || 1;
      const weight = parseFloat(weightInput.value) || 0;
      if (!name) { showToast("Digite o nome do exercício."); return; }
      const data = { name, sets, reps, weight };
      if (idx !== null) editingWorkout.exercises[idx] = data;
      else editingWorkout.exercises.push(data);
      closeModal();
      renderExerciseEditorList();
    });
    const wrap = el("div", {}, [
      el("label", { class: "field-label" }, ["Nome do exercício"]), nameInput,
      el("div", { class: "input-row" }, [
        el("div", { style: "flex:1" }, [el("label", { class: "field-label" }, ["Séries"]), setsInput]),
        el("div", { style: "flex:1" }, [el("label", { class: "field-label" }, ["Repetições"]), repsInput]),
      ]),
      el("label", { class: "field-label" }, ["Peso (kg)"]), weightInput,
      saveBtn
    ]);
    openModal(existing ? "Editar exercício" : "Novo exercício", wrap);
  }

  document.getElementById("saveWorkoutBtn").addEventListener("click", () => {
    const name = document.getElementById("workoutNameInput").value.trim();
    if (!name) { showToast("Digite um nome para o treino."); return; }
    editingWorkout.name = name;
    if (editingWorkout.id) {
      const idx = DATA.workouts.findIndex(w => w.id === editingWorkout.id);
      DATA.workouts[idx] = editingWorkout;
    } else {
      editingWorkout.id = uid();
      DATA.workouts.push(editingWorkout);
    }
    saveData();
    showToast("Treino salvo.");
    goToScreen("treinos");
  });

  document.getElementById("deleteWorkoutBtn").addEventListener("click", () => {
    confirmModal(`Excluir o treino "${editingWorkout.name}"?`, () => {
      DATA.workouts = DATA.workouts.filter(w => w.id !== editingWorkout.id);
      saveData();
      goToScreen("treinos");
    });
  });

  /* ---------- executar treino ---------- */
  let runningWorkout = null; // { workoutId, name, exercises: [{name, sets:[{weight,reps,done}]}] }

  function startWorkoutExecution(workoutId) {
    const w = DATA.workouts.find(x => x.id === workoutId);
    if (!w) return;
    if (w.exercises.length === 0) { showToast("Este treino ainda não tem exercícios."); return; }
    runningWorkout = {
      workoutId: w.id,
      name: w.name,
      exercises: w.exercises.map(ex => ({
        name: ex.name,
        sets: Array.from({ length: ex.sets }, () => ({ weight: ex.weight, reps: ex.reps, done: false }))
      }))
    };
    document.getElementById("runWorkoutTitle").textContent = w.name.toUpperCase();
    renderRunExerciseList();
    goToScreen("executar-treino");
  }

  function renderRunExerciseList() {
    const container = document.getElementById("runExerciseList");
    container.innerHTML = "";
    runningWorkout.exercises.forEach((ex, exIdx) => {
      const card = el("div", { class: "run-exercise" });
      card.appendChild(el("p", { class: "run-exercise-title" }, [ex.name]));
      ex.sets.forEach((s, sIdx) => {
        const row = el("div", { class: "set-row", "data-done": s.done ? "true" : "false" });
        row.appendChild(el("span", { class: "set-row-label" }, [`Série ${sIdx + 1}`]));
        row.appendChild(el("span", { class: "set-row-vals" }, [`${s.weight} kg × ${s.reps}`]));
        const check = el("button", { class: "set-check" }, [
          el("svg", { viewBox: "0 0 24 24", width: "14", height: "14", html: '<path d="M5 12.5 9.5 17 19 7" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="opacity:' + (s.done ? 1 : 0) + '"/>' })
        ]);
        check.addEventListener("click", () => {
          s.done = !s.done;
          renderRunExerciseList();
        });
        row.appendChild(check);
        card.appendChild(row);
      });
      container.appendChild(card);
    });
  }

  document.getElementById("finishWorkoutBtn").addEventListener("click", () => {
    const today = todayStr();
    DATA.workoutHistory.push({
      id: uid(),
      workoutId: runningWorkout.workoutId,
      workoutName: runningWorkout.name,
      date: today,
      exercises: runningWorkout.exercises
    });
    saveData();
    showToast("Treino finalizado!");
    goToScreen("home");
  });

  /* ------------------------------------------------------------------ *
   *  CORRIDA
   * ------------------------------------------------------------------ */
  function formatKm(v) {
    return (Math.round(v * 100) / 100).toString().replace(".", ",");
  }

  function timeToSeconds(t) {
    const parts = t.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
  }

  function paceStr(distanceKm, timeStr) {
    if (!distanceKm) return "—";
    const totalSec = timeToSeconds(timeStr);
    const paceSec = Math.round(totalSec / distanceKm);
    const m = Math.floor(paceSec / 60);
    const s = paceSec % 60;
    return `${m}:${pad2(s)}`;
  }

  function paceSeconds(distanceKm, timeStr) {
    if (!distanceKm) return Infinity;
    return timeToSeconds(timeStr) / distanceKm;
  }

  function renderCorrida() {
    const totalKm = DATA.runs.reduce((sum, r) => sum + r.distance, 0);
    document.getElementById("runTotalKm").textContent = formatKm(totalKm);
    document.getElementById("runCount").textContent = DATA.runs.length;
    document.getElementById("runMaxDist").textContent = DATA.runs.length ? formatKm(Math.max(...DATA.runs.map(r => r.distance))) : "0";
    if (DATA.runs.length) {
      const best = DATA.runs.reduce((b, r) => paceSeconds(r.distance, r.time) < paceSeconds(b.distance, b.time) ? r : b);
      document.getElementById("runBestPace").textContent = paceStr(best.distance, best.time) + "/km";
    } else {
      document.getElementById("runBestPace").textContent = "—";
    }

    const listEl = document.getElementById("runHistoryList");
    listEl.innerHTML = "";
    const sorted = [...DATA.runs].sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(r => listEl.appendChild(renderRunRow(r)));
    document.getElementById("runHistoryEmpty").hidden = sorted.length > 0;
  }

  function renderRunRow(r) {
    const li = el("li", { class: "list-card" });
    const main = el("div", { class: "list-card-main" });
    main.appendChild(el("p", { class: "list-card-title" }, [formatDateShort(r.date) + " · " + formatKm(r.distance) + " km"]));
    main.appendChild(el("p", { class: "list-card-sub" }, [`${r.time} • ${paceStr(r.distance, r.time)}/km • ${r.type}` + (r.note ? " • " + r.note : "")]));
    const actions = el("div", { class: "list-card-actions" }, [
      iconEditBtn(() => openRunModal(r)),
      iconDeleteBtn(() => confirmModal("Excluir esta corrida?", () => {
        DATA.runs = DATA.runs.filter(x => x.id !== r.id);
        saveData(); renderCorrida();
      }))
    ]);
    li.appendChild(main);
    li.appendChild(actions);
    return li;
  }

  document.getElementById("addRunBtn").addEventListener("click", () => openRunModal(null));

  function openRunModal(existing) {
    const distInput = el("input", { class: "input", type: "number", step: "0.01", min: "0", placeholder: "Ex: 5.3", value: existing ? existing.distance : "" });
    const timeInput = el("input", { class: "input", type: "text", placeholder: "mm:ss (ex: 32:00)", value: existing ? existing.time : "" });
    const dateInput = el("input", { class: "input", type: "date", value: existing ? existing.date : todayStr() });
    const typeSelect = el("select", { class: "input" });
    RUN_TYPES.forEach(t => typeSelect.appendChild(el("option", { value: t }, [t])));
    typeSelect.value = existing ? existing.type : RUN_TYPES[0];
    const noteInput = el("input", { class: "input", type: "text", placeholder: "Observação (opcional)", value: existing ? (existing.note || "") : "" });

    const saveBtn = el("button", { class: "btn btn-primary btn-block" }, [existing ? "Salvar alterações" : "Registrar corrida"]);
    saveBtn.addEventListener("click", () => {
      const distance = parseFloat(distInput.value);
      const time = timeInput.value.trim();
      const date = dateInput.value || todayStr();
      if (!distance || distance <= 0) { showToast("Informe a distância."); return; }
      if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(time)) { showToast("Informe o tempo no formato mm:ss."); return; }
      if (existing) {
        Object.assign(existing, { distance, time, date, type: typeSelect.value, note: noteInput.value.trim() });
      } else {
        DATA.runs.push({ id: uid(), distance, time, date, type: typeSelect.value, note: noteInput.value.trim() });
      }
      saveData();
      closeModal();
      renderScreen(currentScreenName());
      showToast(existing ? "Corrida atualizada." : "Corrida registrada.");
    });

    const wrap = el("div", {}, [
      el("label", { class: "field-label" }, ["Distância (km)"]), distInput,
      el("label", { class: "field-label" }, ["Tempo"]), timeInput,
      el("label", { class: "field-label" }, ["Data"]), dateInput,
      el("label", { class: "field-label" }, ["Tipo"]), typeSelect,
      el("label", { class: "field-label" }, ["Observação"]), noteInput,
      saveBtn
    ]);
    openModal(existing ? "Editar corrida" : "Registrar corrida", wrap);
  }

  /* ------------------------------------------------------------------ *
   *  PROGRESSO (semana, calendário, estatísticas)
   * ------------------------------------------------------------------ */
  let calCursor = new Date(); // month currently displayed

  function renderProgresso() {
    // weekly bar: last 7 days including today
    const today = todayStr();
    let produtivos = 0;
    for (let i = 6; i >= 0; i--) {
      const d = addDays(today, -i);
      if (isProductiveDay(d)) produtivos++;
    }
    document.getElementById("weekProgressFrac").textContent = `${produtivos} / 7 dias`;
    document.getElementById("weekProgressFill").style.width = Math.round((produtivos / 7) * 100) + "%";

    renderCalendar();

    // stats
    const tasksDone = DATA.tasks.reduce((s, t) => s + (t.completedDates || []).length, 0);
    const habitsDone = DATA.habits.reduce((s, h) => s + (h.completedDates || []).length, 0);
    const bestStreak = DATA.habits.reduce((max, h) => Math.max(max, habitStreak(h, today)), 0);
    document.getElementById("statTasksDone").textContent = tasksDone;
    document.getElementById("statHabitsDone").textContent = habitsDone;
    document.getElementById("statBestStreak").textContent = bestStreak;
    document.getElementById("statWorkoutsDone").textContent = DATA.workoutHistory.length;
    const totalKm = DATA.runs.reduce((sum, r) => sum + r.distance, 0);
    document.getElementById("statRunKm").textContent = formatKm(totalKm);
    document.getElementById("statRunCount").textContent = DATA.runs.length;
  }

  document.getElementById("calPrevBtn").addEventListener("click", () => {
    calCursor.setMonth(calCursor.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById("calNextBtn").addEventListener("click", () => {
    calCursor.setMonth(calCursor.getMonth() + 1);
    renderCalendar();
  });

  function renderCalendar() {
    const label = `${MONTH_LABELS[calCursor.getMonth()]} de ${calCursor.getFullYear()}`;
    document.getElementById("calMonthLabel").textContent = label.charAt(0).toUpperCase() + label.slice(1);
    const grid = document.getElementById("calGrid");
    grid.innerHTML = "";
    ["D", "S", "T", "Q", "Q", "S", "S"].forEach(l => {
      grid.appendChild(el("div", { class: "cal-cell", "data-empty": "true", style: "background:none;color:var(--text-faint);font-weight:700;" }, [l]));
    });
    const year = calCursor.getFullYear(), month = calCursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayStr();

    for (let i = 0; i < firstDow; i++) grid.appendChild(el("div", { class: "cal-cell", "data-empty": "true" }));

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${pad2(month + 1)}-${pad2(day)}`;
      const items = dayItems(dateStr);
      const hasRotina = items.some(i => (i.type === "task" || i.type === "habit") && i.done);
      const hasWorkout = anyWorkoutDoneOn(dateStr);
      const hasRun = runsOn(dateStr).length > 0;
      const cell = el("div", { class: "cal-cell", "data-today": dateStr === today ? "true" : "false" });
      cell.appendChild(el("span", {}, [String(day)]));
      const dots = el("div", { class: "cal-cell-dots" });
      if (hasRotina) dots.appendChild(el("span", { class: "cal-dot", style: "background:var(--good)" }));
      if (hasWorkout) dots.appendChild(el("span", { class: "cal-dot", style: "background:var(--accent)" }));
      if (hasRun) dots.appendChild(el("span", { class: "cal-dot", style: "background:var(--run)" }));
      cell.appendChild(dots);
      cell.addEventListener("click", () => showCalDetail(dateStr));
      grid.appendChild(cell);
    }
  }

  function showCalDetail(dateStr) {
    const detail = document.getElementById("calDetail");
    const items = dayItems(dateStr);
    const doneTasks = DATA.tasks.filter(t => (t.completedDates || []).includes(dateStr));
    const doneHabits = DATA.habits.filter(h => (h.completedDates || []).includes(dateStr));
    const workouts = DATA.workoutHistory.filter(h => h.date === dateStr);
    const runs = runsOn(dateStr);

    const lines = [];
    lines.push(`<strong style="color:var(--text)">${formatDateLong(dateStr)}</strong>`);
    if (doneTasks.length) lines.push("Tarefas: " + doneTasks.map(t => t.name).join(", "));
    if (doneHabits.length) lines.push("Hábitos: " + doneHabits.map(h => h.name).join(", "));
    if (workouts.length) lines.push("Treinos: " + workouts.map(w => w.workoutName).join(", "));
    if (runs.length) lines.push("Corridas: " + runs.map(r => `${formatKm(r.distance)} km (${r.time})`).join(", "));
    if (items.length === 0) lines.push("Nenhuma atividade planejada neste dia.");
    else if (lines.length === 1) lines.push("Nenhuma atividade concluída neste dia.");

    detail.innerHTML = lines.join("<br>");
    detail.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   *  CONFIGURAÇÕES
   * ------------------------------------------------------------------ */
  function renderConfig() {
    document.getElementById("configNameInput").value = DATA.settings.name || "";
    document.querySelectorAll("#themeTabs .seg-btn").forEach(b => {
      b.dataset.segActive = b.dataset.theme === DATA.settings.theme ? "true" : "false";
    });
  }

  document.getElementById("configNameInput").addEventListener("change", e => {
    DATA.settings.name = e.target.value.trim();
    saveData();
  });

  document.getElementById("themeTabs").addEventListener("click", e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    document.querySelectorAll("#themeTabs .seg-btn").forEach(b => b.dataset.segActive = "false");
    btn.dataset.segActive = "true";
    DATA.settings.theme = btn.dataset.theme;
    applyTheme();
    saveData();
  });

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", DATA.settings.theme === "light" ? "light" : "dark");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", DATA.settings.theme === "light" ? "#F4F4F7" : "#0B0C10");
  }

  document.getElementById("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `focus-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Backup exportado.");
  });

  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });

  document.getElementById("importFile").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        confirmModal("Importar este backup vai substituir todos os dados atuais. Continuar?", () => {
          DATA = Object.assign(defaultData(), parsed);
          saveData();
          applyTheme();
          renderScreen(currentScreenName());
          showToast("Dados importados com sucesso.");
        }, "Importar");
      } catch (err) {
        showToast("Arquivo inválido.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  document.getElementById("wipeBtn").addEventListener("click", () => {
    confirmModal("Isso vai apagar TODOS os seus dados (tarefas, hábitos, treinos e corridas). Esta ação não pode ser desfeita.", () => {
      DATA = defaultData();
      saveData();
      applyTheme();
      renderScreen(currentScreenName());
      showToast("Todos os dados foram apagados.");
    }, "Apagar tudo");
  });

  /* ------------------------------------------------------------------ *
   *  Init
   * ------------------------------------------------------------------ */
  function init() {
    applyTheme();
    goToScreen("home");

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }
  }

  init();
})();

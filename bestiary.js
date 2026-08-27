(() => {
  "use strict";

  /* ---------- Constants ---------- */

  const STORAGE_KEY = "field-bestiary-creatures";
  const DIRTY_KEY = "field-bestiary-dirty";
  const CREATURES_FILE = "creatures.json";

  const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

  const TYPES = [
    "fey", "plant", "humanoid", "monstrosity",
    "elemental", "beast", "undead", "fiend", "construct", "other"
  ];

  const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];

  const TYPE_COLORS = {
    fey: "#4b5a37",
    plant: "#3d5c33",
    humanoid: "#a2793f",
    monstrosity: "#7c2a20",
    elemental: "#3a5a58",
    beast: "#7a6a3a",
    undead: "#5b5147",
    fiend: "#5c1e17",
    construct: "#6a6e75",
    other: "#665c4d"
  };

  const SKILLS = [
    { name: "Acrobatics", ability: "dex" },
    { name: "Animal Handling", ability: "wis" },
    { name: "Arcana", ability: "int" },
    { name: "Athletics", ability: "str" },
    { name: "Deception", ability: "cha" },
    { name: "History", ability: "int" },
    { name: "Insight", ability: "wis" },
    { name: "Intimidation", ability: "cha" },
    { name: "Investigation", ability: "int" },
    { name: "Medicine", ability: "wis" },
    { name: "Nature", ability: "int" },
    { name: "Perception", ability: "wis" },
    { name: "Performance", ability: "cha" },
    { name: "Persuasion", ability: "cha" },
    { name: "Religion", ability: "int" },
    { name: "Sleight of Hand", ability: "dex" },
    { name: "Stealth", ability: "dex" },
    { name: "Survival", ability: "wis" }
  ];

  const SKILL_BY_NAME = Object.fromEntries(SKILLS.map(s => [s.name, s]));

  /* ---------- Persistence ---------- */

  function loadCreatures() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function saveCreatures({ dirty = true } = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(CREATURES));
    if (dirty) localStorage.setItem(DIRTY_KEY, "1");
    else localStorage.removeItem(DIRTY_KEY);
  }

  function isLocalDirty() {
    return localStorage.getItem(DIRTY_KEY) === "1";
  }

  function normalizeCreaturesPayload(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.CREATURES)) return data.CREATURES;
    return null;
  }

  async function fetchCreaturesFile() {
    try {
      const res = await fetch(CREATURES_FILE, { cache: "no-store" });
      if (!res.ok) return null;
      return normalizeCreaturesPayload(await res.json());
    } catch {
      // Missing file, or file:// CORS — fall back to localStorage
      return null;
    }
  }

  async function resolveCreatures() {
    const stored = loadCreatures();
    const fromFile = await fetchCreaturesFile();

    if (fromFile) {
      if (isLocalDirty() && stored.length) return stored;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fromFile));
      localStorage.removeItem(DIRTY_KEY);
      return fromFile;
    }

    return stored;
  }

  /*
    Creature schema:
    {
      id, name, type, size, ac, hp, speed,
      stats: { str|dex|con|int|wis|cha: number | "unknown" },
      profBonus: number | "unknown",
      saveProf: string[],   // "str" | "dex" | ...
      skillProf: string[],
      resistances?, vulnerabilities?, immunities?, conditionImmunities?,
      senses?, languages?,
      spellcasting?: { summary, levels: string[] },
      traits?: { name, desc }[],
      actions?: { name, desc }[]
    }
  */
  let CREATURES = [];

  /* ---------- State ---------- */

  const state = {
    activeId: null,
    search: "",
    editingId: null
  };

  /* ---------- DOM ---------- */

  const el = {
    search: document.getElementById("search"),
    legend: document.getElementById("legend"),
    tabList: document.getElementById("tabList"),
    main: document.getElementById("main"),
    backdrop: document.getElementById("modalBackdrop"),
    form: document.getElementById("creatureForm"),
    modalTitle: document.getElementById("modalTitle"),
    abilityMods: document.getElementById("abilityMods"),
    saveGrid: document.getElementById("saveGrid"),
    skillGrid: document.getElementById("skillGrid"),
    type: document.getElementById("f-type"),
    size: document.getElementById("f-size"),
    prof: document.getElementById("f-prof"),
    id: document.getElementById("f-id"),
    traitRows: document.getElementById("traitRows"),
    actionRows: document.getElementById("actionRows"),
    btnAdd: document.getElementById("btnAdd"),
    btnExport: document.getElementById("btnExport"),
    btnImport: document.getElementById("btnImport"),
    importFile: document.getElementById("importFile"),
    btnCancel: document.getElementById("btnCancel"),
    addTrait: document.getElementById("addTrait"),
    addAction: document.getElementById("addAction")
  };

  /* ---------- Utils ---------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hasValue(value) {
    return value !== undefined && value !== null && value !== "";
  }

  function isUnknown(value) {
    return value === "unknown" || !hasValue(value);
  }

  function formatMod(value) {
    if (isUnknown(value) || Number.isNaN(Number(value))) return "?";
    const n = Number(value);
    return n >= 0 ? `+${n}` : String(n);
  }

  function parseMod(raw) {
    return raw === "unknown" ? "unknown" : parseInt(raw, 10);
  }

  function setSelectValue(select, value, fallback) {
    const next = hasValue(value) ? String(value) : String(fallback);
    if ([...select.options].some(opt => opt.value === next)) {
      select.value = next;
    } else {
      select.value = String(fallback);
    }
  }

  function slugify(text) {
    const base = text.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return base || `creature-${Date.now()}`;
  }

  function uniqueId(name) {
    return `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function typeColor(type) {
    return TYPE_COLORS[type] || "#888";
  }

  function optionRange({ from, to, unknown = true, selected, signed = true }) {
    const options = [];
    if (unknown) options.push('<option value="unknown">?</option>');
    for (let i = from; i <= to; i++) {
      const label = signed ? (i >= 0 ? `+${i}` : String(i)) : String(i);
      const isSelected = i === selected ? " selected" : "";
      options.push(`<option value="${i}"${isSelected}>${label}</option>`);
    }
    return options.join("");
  }

  /* ---------- Domain ---------- */

  function skillBonus(creature, skillName) {
    const skill = SKILL_BY_NAME[skillName];
    if (!skill) return null;
    const ability = creature.stats?.[skill.ability];
    const prof = creature.profBonus;
    if (isUnknown(ability) || isUnknown(prof)) return null;
    return Number(ability) + Number(prof);
  }

  function saveBonus(creature, abilityKey) {
    const ability = creature.stats?.[abilityKey];
    const prof = creature.profBonus;
    if (isUnknown(ability) || isUnknown(prof)) return null;
    return Number(ability) + Number(prof);
  }

  function formatSkills(creature) {
    const list = creature.skillProf || [];
    if (!list.length) return "";
    return list.map(name => {
      const bonus = skillBonus(creature, name);
      return bonus === null ? `${name} ?` : `${name} ${formatMod(bonus)}`;
    }).join(", ");
  }

  function formatSaves(creature) {
    const list = creature.saveProf || [];
    if (!list.length) return creature.saves || "";
    return list.map(key => {
      const bonus = saveBonus(creature, key);
      const label = key.toUpperCase();
      return bonus === null ? `${label} ?` : `${label} ${formatMod(bonus)}`;
    }).join(", ");
  }

  function readNamedEntries(container) {
    return $$(".repeat-row", container)
      .map(row => ({
        name: $(".r-name", row).value.trim(),
        desc: $(".r-desc", row).value.trim()
      }))
      .filter(entry => entry.name || entry.desc);
  }

  function readCreatureFromForm() {
    const name = $("#f-name").value.trim() || "Unnamed Creature";
    const existingId = el.id.value.trim();
    const stats = Object.fromEntries(
      ABILITIES.map(key => [key, parseMod($(`#f-${key}`).value)])
    );

    return {
      id: existingId || uniqueId(name),
      name,
      type: el.type.value,
      size: el.size.value,
      ac: $("#f-ac").value.trim(),
      hp: $("#f-hp").value.trim(),
      speed: $("#f-speed").value.trim(),
      stats,
      profBonus: parseMod(el.prof.value),
      saveProf: $$('input[name="saveProf"]:checked').map(input => input.value),
      skillProf: $$('input[name="skillProf"]:checked').map(input => input.value),
      resistances: $("#f-resistances").value.trim(),
      vulnerabilities: $("#f-vulnerabilities").value.trim(),
      immunities: $("#f-immunities").value.trim(),
      conditionImmunities: $("#f-conditionImmunities").value.trim(),
      senses: $("#f-senses").value.trim(),
      languages: $("#f-languages").value.trim(),
      traits: readNamedEntries(el.traitRows),
      actions: readNamedEntries(el.actionRows)
    };
  }

  function filteredCreatures() {
    const q = state.search.toLowerCase();
    if (!q) return CREATURES;
    return CREATURES.filter(c =>
      `${c.name} ${c.type}`.toLowerCase().includes(q)
    );
  }

  function upsertCreature(creature) {
    const index = CREATURES.findIndex(c => c.id === creature.id);
    if (index >= 0) {
      CREATURES[index] = { ...CREATURES[index], ...creature };
    } else {
      CREATURES.push(creature);
    }
    saveCreatures();
  }

  function deleteCreature(id) {
    const index = CREATURES.findIndex(c => c.id === id);
    if (index < 0) return;
    CREATURES.splice(index, 1);
    if (state.activeId === id) {
      state.activeId = CREATURES[0]?.id ?? null;
    }
    saveCreatures();
  }

  function duplicateCreature(id) {
    const index = CREATURES.findIndex(c => c.id === id);
    if (index < 0) return null;

    const source = CREATURES[index];
    const copy = structuredClone(source);
    copy.name = `${source.name} (Copy)`;
    copy.id = uniqueId(copy.name);
    CREATURES.splice(index + 1, 0, copy);
    saveCreatures();
    return copy;
  }

  /* ---------- Render helpers ---------- */

  function metaLine(label, value) {
    if (!value) return "";
    return `<div><b>${esc(label)}.</b> ${esc(value)}</div>`;
  }

  function renderEntries(entries) {
    return (entries || []).map(entry => `
      <div class="entry">
        <span class="entry-name">${esc(entry.name)}.</span> ${esc(entry.desc)}
      </div>
    `).join("");
  }

  function renderSpellcasting(spellcasting) {
    if (!spellcasting) return "";
    const levels = (spellcasting.levels || [])
      .map(line => `<div>${esc(line)}</div>`)
      .join("");
    return `
      <div class="entry">
        <span class="entry-name">Spellcasting.</span> ${esc(spellcasting.summary)}
      </div>
      <div class="spell-levels">${levels}</div>
    `;
  }

  function renderAbilityTable(creature) {
    const headers = ABILITIES.map(key => `<th>${key.toUpperCase()}</th>`).join("");
    const cells = ABILITIES.map(key =>
      `<td>${formatMod(creature.stats?.[key])}</td>`
    ).join("");
    return `
      <table class="ability-table">
        <thead><tr>${headers}</tr></thead>
        <tbody><tr>${cells}</tr></tbody>
      </table>
    `;
  }

  function renderSection(title, html) {
    return html ? `<div class="section-title">${esc(title)}</div>${html}` : "";
  }

  /* ---------- Views ---------- */

  function renderLegend() {
    const types = [...new Set(CREATURES.map(c => c.type))];
    el.legend.innerHTML = types.map(type => `
      <span><i style="background:${typeColor(type)}"></i>${esc(type)}</span>
    `).join("");
  }

  function renderTabs() {
    const visible = filteredCreatures();

    if (!visible.length) {
      const message = state.search
        ? `No creatures match “${state.search}”.`
        : "No creatures yet — add one.";
      el.tabList.innerHTML = `<div class="empty-note">${esc(message)}</div>`;
      return;
    }

    el.tabList.innerHTML = visible.map(creature => `
      <button type="button" class="tab ${creature.id === state.activeId ? "active" : ""}" data-id="${esc(creature.id)}">
        <span class="dot" style="background:${typeColor(creature.type)}"></span>
        <span class="name">${esc(creature.name)}</span>
      </button>
    `).join("");
  }

  function renderPage() {
    const creature = CREATURES.find(c => c.id === state.activeId);

    if (!creature) {
      el.main.innerHTML = `
        <div class="placeholder">
          Select a creature from the index<br>— or add a new one —
        </div>
      `;
      return;
    }

    const traits = renderEntries(creature.traits);
    const spells = renderSpellcasting(creature.spellcasting);
    const actions = renderEntries(creature.actions);
    const subtitle = [creature.size, creature.type].filter(Boolean).join(" ");

    el.main.innerHTML = `
      <article class="page">
        <header class="page-head">
          <div>
            <h2>${esc(creature.name)}</h2>
            <p class="sub">${esc(subtitle)}</p>
          </div>
          <div class="page-actions">
            <button type="button" data-action="edit">Edit</button>
            <button type="button" data-action="duplicate">Duplicate</button>
            <button type="button" class="danger" data-action="delete">Delete</button>
          </div>
        </header>

        <div class="core-stats">
          <div><b>Armor Class</b>${esc(creature.ac || "—")}</div>
          <div><b>Hit Points</b>${esc(creature.hp || "—")}</div>
          <div><b>Speed</b>${esc(creature.speed || "—")}</div>
        </div>

        ${renderAbilityTable(creature)}

        <div class="meta-lines">
          ${hasValue(creature.profBonus) ? metaLine("Proficiency Bonus", formatMod(creature.profBonus)) : ""}
          ${metaLine("Saving Throws", formatSaves(creature))}
          ${metaLine("Skills", formatSkills(creature))}
          ${metaLine("Damage Resistances", creature.resistances)}
          ${metaLine("Damage Vulnerabilities", creature.vulnerabilities)}
          ${metaLine("Damage Immunities", creature.immunities)}
          ${metaLine("Condition Immunities", creature.conditionImmunities)}
          ${metaLine("Senses", creature.senses)}
          ${metaLine("Languages", creature.languages)}
        </div>

        ${renderSection("Traits", traits + spells)}
        ${renderSection("Actions", actions)}
      </article>
    `;
  }

  function refresh() {
    renderLegend();
    renderTabs();
    renderPage();
  }

  /* ---------- Form / modal ---------- */

  function addNamedRow(container, namePlaceholder, descPlaceholder, values = {}) {
    const row = document.createElement("div");
    row.className = "repeat-row";
    row.innerHTML = `
      <div class="fields">
        <input class="r-name" placeholder="${esc(namePlaceholder)}" value="${esc(values.name || "")}">
        <textarea class="r-desc" placeholder="${esc(descPlaceholder)}">${esc(values.desc || "")}</textarea>
      </div>
      <button type="button" class="r-remove" aria-label="Remove">✕</button>
    `;
    $(".r-remove", row).addEventListener("click", () => row.remove());
    container.appendChild(row);
  }

  function fillNamedRows(container, entries, namePlaceholder, descPlaceholder) {
    container.innerHTML = "";
    const list = entries?.length ? entries : [{}];
    list.forEach(entry => addNamedRow(container, namePlaceholder, descPlaceholder, entry));
  }

  function fillForm(creature) {
    el.form.reset();
    el.id.value = creature?.id || "";
    $("#f-name").value = creature?.name || "";
    setSelectValue(el.type, creature?.type, TYPES[0]);
    setSelectValue(el.size, creature?.size, "Medium");
    $("#f-ac").value = creature?.ac || "";
    $("#f-hp").value = creature?.hp || "";
    $("#f-speed").value = creature?.speed || "";

    ABILITIES.forEach(key => {
      setSelectValue($(`#f-${key}`), creature?.stats?.[key], 0);
    });
    setSelectValue(el.prof, creature?.profBonus, 2);

    const selectedSaves = new Set(creature?.saveProf || []);
    $$('input[name="saveProf"]').forEach(input => {
      input.checked = selectedSaves.has(input.value);
    });

    const selectedSkills = new Set(creature?.skillProf || []);
    $$('input[name="skillProf"]').forEach(input => {
      input.checked = selectedSkills.has(input.value);
    });

    $("#f-resistances").value = creature?.resistances || "";
    $("#f-vulnerabilities").value = creature?.vulnerabilities || "";
    $("#f-immunities").value = creature?.immunities || "";
    $("#f-conditionImmunities").value = creature?.conditionImmunities || "";
    $("#f-senses").value = creature?.senses || "";
    $("#f-languages").value = creature?.languages || "";

    fillNamedRows(el.traitRows, creature?.traits, "Trait name (e.g. Amphibious)", "What it does…");
    fillNamedRows(el.actionRows, creature?.actions, "Action name (e.g. Claw)", "Attack bonus, reach/range, damage…");
  }

  function openCreateModal() {
    state.editingId = null;
    el.modalTitle.textContent = "Add a Creature";
    fillForm(null);
    el.backdrop.classList.add("open");
    $("#f-name").focus();
  }

  function openEditModal(creature) {
    state.editingId = creature.id;
    el.modalTitle.textContent = "Edit Creature";
    fillForm(creature);
    el.backdrop.classList.add("open");
    $("#f-name").focus();
  }

  function closeModal() {
    state.editingId = null;
    el.backdrop.classList.remove("open");
  }

  function saveAndCloseModal() {
    if (!el.backdrop.classList.contains("open")) return;

    const nameInput = $("#f-name").value.trim();
    const creature = readCreatureFromForm();
    const isNew = !state.editingId;
    const emptyDraft = isNew
      && !nameInput
      && !creature.ac
      && !creature.hp
      && !creature.speed
      && !(creature.traits || []).length
      && !(creature.actions || []).length;

    if (emptyDraft) {
      closeModal();
      return;
    }

    upsertCreature(creature);
    state.activeId = creature.id;
    closeModal();
    refresh();
  }

  function buildFormControls() {
    el.type.innerHTML = TYPES.map(type =>
      `<option value="${type}">${type[0].toUpperCase()}${type.slice(1)}</option>`
    ).join("");

    el.size.innerHTML = SIZES.map(size =>
      `<option${size === "Medium" ? " selected" : ""}>${size}</option>`
    ).join("");

    el.abilityMods.innerHTML = ABILITIES.map(key => `
      <div>
        <label for="f-${key}">${key.toUpperCase()}</label>
        <select id="f-${key}" name="${key}">
          ${optionRange({ from: -5, to: 10, selected: 0 })}
        </select>
      </div>
    `).join("");

    el.saveGrid.innerHTML = ABILITIES.map(key => `
      <label>
        <input type="checkbox" name="saveProf" value="${key}">
        ${key.toUpperCase()}
      </label>
    `).join("");

    el.prof.innerHTML = optionRange({ from: 1, to: 9, selected: 2 });

    el.skillGrid.innerHTML = SKILLS.map(skill => `
      <label>
        <input type="checkbox" name="skillProf" value="${esc(skill.name)}">
        ${esc(skill.name)}
      </label>
    `).join("");
  }

  /* ---------- Export / Import ---------- */

  async function exportCreatures() {
    const payload = JSON.stringify(CREATURES, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = CREATURES_FILE;
    link.click();
    URL.revokeObjectURL(url);

    try {
      await navigator.clipboard.writeText(payload);
      const label = el.btnExport.textContent;
      el.btnExport.textContent = "Copied!";
      setTimeout(() => { el.btnExport.textContent = label; }, 1500);
    } catch {
      /* download already happened */
    }
  }

  function importCreatures(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = normalizeCreaturesPayload(JSON.parse(reader.result));
        if (!data) throw new Error("Expected a JSON array");
        CREATURES = data;
        state.activeId = CREATURES[0]?.id ?? null;
        saveCreatures({ dirty: true });
        refresh();
      } catch (err) {
        alert(`Could not import JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Events ---------- */

  function bindEvents() {
    el.search.addEventListener("input", e => {
      state.search = e.target.value.trim();
      renderTabs();
    });

    el.tabList.addEventListener("click", e => {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      state.activeId = tab.dataset.id;
      renderTabs();
      renderPage();
    });

    el.main.addEventListener("click", e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const creature = CREATURES.find(c => c.id === state.activeId);
      if (!creature) return;

      if (btn.dataset.action === "edit") {
        openEditModal(creature);
        return;
      }

      if (btn.dataset.action === "duplicate") {
        const copy = duplicateCreature(creature.id);
        if (copy) {
          state.activeId = copy.id;
          refresh();
        }
        return;
      }

      if (btn.dataset.action === "delete") {
        if (!confirm(`Delete “${creature.name}”?`)) return;
        deleteCreature(creature.id);
        refresh();
      }
    });

    el.btnAdd.addEventListener("click", openCreateModal);
    el.btnCancel.addEventListener("click", closeModal);
    el.backdrop.addEventListener("click", e => {
      if (e.target === el.backdrop) saveAndCloseModal();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closeModal();
    });

    el.addTrait.addEventListener("click", () =>
      addNamedRow(el.traitRows, "Trait name (e.g. Amphibious)", "What it does…")
    );
    el.addAction.addEventListener("click", () =>
      addNamedRow(el.actionRows, "Action name (e.g. Claw)", "Attack bonus, reach/range, damage…")
    );

    el.form.addEventListener("submit", e => {
      e.preventDefault();
      saveAndCloseModal();
    });

    el.btnExport.addEventListener("click", () => exportCreatures());
    el.btnImport.addEventListener("click", () => el.importFile.click());
    el.importFile.addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file) importCreatures(file);
      e.target.value = "";
    });
  }

  /* ---------- Boot ---------- */

  async function boot() {
    buildFormControls();
    bindEvents();
    CREATURES = await resolveCreatures();
    state.activeId = CREATURES[0]?.id ?? null;
    refresh();
  }

  boot();
})();

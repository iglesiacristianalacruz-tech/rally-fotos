(function initApp() {
  const app = document.getElementById("app");
  const cameraInput = document.getElementById("cameraInput");
  const core = window.AppCore;
  const config = window.APP_CONFIG || {};
  const bucket = config.bucket || "team-photos";
  const hasRemote = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  const supabase = hasRemote
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;
  const initialItems = [
    "Alguien leyendo la Biblia mientras todos los demás hacen una pose dramática.",
    "Todo el equipo haciendo la misma pose que el pastor.",
    "Todo el equipo sonriendo y nadie tenga los ojos cerrados.",
    "Con todo el equipo de cocina haciendo un corazón con las manos.",
    "Todo el equipo formando la palabra CAOS usando únicamente sus cuerpos.",
    "Foto formando una pirámide humana (segura).",
    "Foto de todos saltando exactamente al mismo tiempo, en el aire.",
    "Foto recreando un milagro de Jesús.",
    "Foto donde aparezca un letrero de C.A.O.S camp.",
    "Foto donde aparezcan al menos 2 personas de un equipo rival.",
    "Mayor cantidad de personas en una SELFIE.",
    "Foto en el lugar más bonito de todo el campamento.",
    "Foto en el lugar más alto de el campamento. (LA TORRE NO CUENTA)"
  ];
  const demoSeedVersion = "caos-rally-v1";

  const savedTeamName = localStorage.getItem("teamName") || "";
  const savedTeamPin = localStorage.getItem("teamPin") || "";

  const state = {
    mode: savedTeamName && savedTeamPin ? "team" : "home",
    teamName: savedTeamName,
    teamPin: savedTeamPin,
    admin: sessionStorage.getItem("adminOk") === "1",
    selectedTeam: "",
    items: [],
    photos: [],
    teams: [],
    pending: [],
    busy: false,
    busyMessage: "",
    cameraItemId: "",
    modal: null,
    toast: "",
    online: navigator.onLine
  };

  const store = hasRemote ? createRemoteStore() : createDemoStore();

  window.addEventListener("online", () => {
    state.online = true;
    toast("Con internet");
    render();
  });

  window.addEventListener("offline", () => {
    state.online = false;
    toast("Sin internet. Las fotos se guardan en este celular.");
    render();
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }

  app.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target.closest("form[data-action]");
    if (!form) return;
    const action = form.dataset.action;
    if (action === "enter-team") {
      const teamName = core.normalizeTeamName(new FormData(form).get("teamName"));
      const pin = core.normalizePin(new FormData(form).get("teamPin"));
      if (!teamName) return toast("Escribe el equipo.");
      if (!pin) return toast("Escribe el PIN del equipo.");
      run(async () => {
        await store.verifyTeamAccess(teamName, pin);
        localStorage.setItem("teamName", teamName);
        localStorage.setItem("teamPin", pin);
        state.teamName = teamName;
        state.teamPin = pin;
        state.mode = "team";
        await loadTeam();
      }, "Entrando...");
    }
    if (action === "admin-login") {
      const pin = String(new FormData(form).get("pin") || "");
      if (pin !== String(config.adminPin || "1234")) return toast("PIN incorrecto.");
      sessionStorage.setItem("adminOk", "1");
      state.admin = true;
      state.mode = "admin";
      run(loadAdmin, "Cargando admin...");
    }
    if (action === "save-team") {
      const currentName = state.modal && state.modal.teamName;
      const nextName = core.normalizeTeamName(new FormData(form).get("teamName"));
      const pin = core.normalizePin(new FormData(form).get("teamPin"));
      if (!nextName) return toast("Escribe el nombre del equipo.");
      if (!pin) return toast("Escribe el PIN del equipo.");
      if (state.teams.some((team) => team.name === nextName && team.name !== currentName)) return toast("Ese equipo ya existe.");
      run(async () => {
        if (currentName) await store.updateTeam(currentName, { name: nextName, pin });
        else await store.createTeam({ name: nextName, pin });
        if (currentName && currentName !== nextName) await renamePendingTeam(currentName, nextName);
        if (state.teamName === currentName) {
          state.teamName = nextName;
          state.teamPin = pin;
          localStorage.setItem("teamName", nextName);
          localStorage.setItem("teamPin", pin);
        }
        state.selectedTeam = nextName;
        state.modal = null;
        await loadAdmin();
        toast(currentName ? "Equipo actualizado." : "Equipo creado.");
      }, currentName ? "Guardando equipo..." : "Creando equipo...");
    }
  });

  app.addEventListener("click", (event) => {
    const control = event.target.closest("[data-action]");
    if (!control) return;
    const { action, itemId, teamName } = control.dataset;

    if (action === "home") {
      state.mode = "home";
      render();
    }
    if (action === "logout-team") {
      localStorage.removeItem("teamName");
      localStorage.removeItem("teamPin");
      state.teamName = "";
      state.teamPin = "";
      state.mode = "home";
      render();
    }
    if (action === "show-admin") {
      state.mode = state.admin ? "admin" : "admin-login";
      run(state.admin ? loadAdmin : async () => render(), state.admin ? "Cargando admin..." : "Cargando...");
    }
    if (action === "logout-admin") {
      sessionStorage.removeItem("adminOk");
      state.admin = false;
      state.mode = "home";
      render();
    }
    if (action === "refresh-team") run(loadTeam, "Actualizando equipo...");
    if (action === "refresh-admin") run(loadAdmin, "Actualizando admin...");
    if (action === "take-photo") openCamera(itemId);
    if (action === "delete-team-photo") deleteTeamPhoto(itemId);
    if (action === "sync-pending") run(syncPendingPhotos, "Subiendo fotos guardadas...");
    if (action === "view-photo") openPhoto(itemId, control.dataset.source || "remote");
    if (action === "close-modal") {
      if (control.classList.contains("modal-backdrop") && event.target !== control) return;
      state.modal = null;
      render();
    }
    if (action === "confirm-modal") {
      const onConfirm = state.modal && state.modal.onConfirm;
      state.modal = null;
      render();
      if (onConfirm) onConfirm();
    }
    if (action === "select-team") {
      state.selectedTeam = teamName;
      render();
    }
    if (action === "admin-delete-photo") adminDeletePhoto(itemId, teamName);
    if (action === "new-team") openTeamForm();
    if (action === "edit-team") openTeamForm(teamName);
    if (action === "delete-team") deleteTeam(teamName);
    if (action === "add-item") addItem();
    if (action === "edit-item") editItem(itemId);
    if (action === "delete-item") deleteItem(itemId);
  });

  app.addEventListener("toggle", (event) => {
    if (!event.target.matches(".team-menu") || !event.target.open) return;
    closeTeamMenus(event.target);
  }, true);

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".team-menu")) closeTeamMenus();
  });

  cameraInput.addEventListener("change", () => {
    const file = cameraInput.files && cameraInput.files[0];
    if (!file || !state.cameraItemId) return;
    const item = state.items.find((entry) => entry.id === state.cameraItemId);
    state.cameraItemId = "";
    if (!item) return toast("Item no encontrado.");
    run(async () => {
      const blob = await fileToJpegBlob(file);
      if (hasRemote && !navigator.onLine) {
        await savePendingPhoto({ teamName: state.teamName, item, blob });
        toast("Foto guardada en este celular.");
      } else {
        try {
          await store.uploadPhoto({ teamName: state.teamName, item, blob });
          await deletePendingPhoto(core.photoKey(state.teamName, item.id));
          toast("Foto subida.");
        } catch (error) {
          await savePendingPhoto({ teamName: state.teamName, item, blob });
          toast(`No se pudo subir. Quedó pendiente. ${error.message || ""}`.trim());
        }
      }
      await loadTeam();
    }, "Subiendo foto...");
  });

  boot();

  async function boot() {
    if (state.mode === "team") await run(loadTeam, "Cargando equipo...");
    else render();
  }

  async function run(task, message = "Cargando...") {
    state.busy = true;
    state.busyMessage = message;
    render();
    try {
      await task();
    } catch (error) {
      console.error(error);
      toast(error.message || "Algo falló.");
    } finally {
      state.busy = false;
      state.busyMessage = "";
      render();
    }
  }

  async function loadTeam() {
    await store.verifyTeamAccess(state.teamName, state.teamPin);
    state.items = core.sortItems(await store.listItems());
    state.photos = await store.listPhotos(state.teamName);
    state.pending = await listPendingPhotos(state.teamName);
  }

  async function loadAdmin() {
    state.items = core.sortItems(await store.listItems());
    state.teams = await store.listTeams();
    state.photos = await store.listAllPhotos();
    if (!state.selectedTeam && state.teams[0]) state.selectedTeam = state.teams[0].name;
  }

  function render() {
    if (state.mode === "team") return renderTeam();
    if (state.mode === "admin-login") return renderAdminLogin();
    if (state.mode === "admin") return renderAdmin();
    return renderHome();
  }

  function renderHome() {
    app.innerHTML = layout(`
      <section class="panel login-panel poster-panel">
        <img class="hero-logo" src="assets/logo.png" alt="CAOS Camp 2">
        <p class="camp-label">CAOS CAMP 2</p>
        <h2>Rally de fotos</h2>
        <div class="rule-box">
          <p>Todo el equipo debe aparecer en cada fotografía. Nadie puede faltar.</p>
          <p>Pueden pedir ayuda para tomar las fotos.</p>
          <p>Diviértanse y sean creativos.</p>
        </div>
        <form data-action="enter-team">
          <div class="form-row">
            <label for="teamName">Equipo</label>
            <input id="teamName" name="teamName" autocomplete="off" placeholder="Equipo 1">
          </div>
          <div class="form-row">
            <label for="teamPin">PIN del equipo</label>
            <input id="teamPin" name="teamPin" inputmode="numeric" type="password" autocomplete="off" placeholder="PIN">
          </div>
          <div class="form-row">
            <button class="primary" type="submit" ${disabled()}>Entrar</button>
          </div>
        </form>
        <div class="form-row">
          <button class="secondary" type="button" data-action="show-admin" ${disabled()}>Admin</button>
        </div>
        <p class="muted small">${hasRemote ? "Online" : "Modo demo local"}</p>
      </section>
    `);
  }

  function renderAdminLogin() {
    app.innerHTML = layout(`
      <section class="panel login-panel poster-panel">
        <img class="hero-logo small-logo" src="assets/logo.png" alt="CAOS Camp 2">
        <h2>Admin</h2>
        <p class="muted">Ingresa el PIN de admin.</p>
        <form data-action="admin-login">
          <div class="form-row">
            <label for="pin">PIN</label>
            <input id="pin" name="pin" inputmode="numeric" type="password" autocomplete="off">
          </div>
          <div class="form-row">
            <button class="primary" type="submit" ${disabled()}>Entrar</button>
          </div>
        </form>
        <div class="form-row">
          <button class="ghost" type="button" data-action="home">Volver</button>
        </div>
      </section>
    `);
  }

  function renderTeam() {
    const { done, total } = core.completion(state.items, state.photos, state.pending);
    const percent = total ? Math.round((done / total) * 100) : 0;
    const pendingCount = state.pending.length;
    app.innerHTML = layout(`
      ${topbar(
        escapeHtml(state.teamName),
        `
          <span class="status-pill ${state.online ? "" : "offline"}">${state.online ? "En linea" : "Sin internet"}</span>
          <button class="secondary" type="button" data-action="refresh-team" ${disabled()}>Refrescar</button>
          <button class="ghost" type="button" data-action="logout-team">Salir</button>
        `
      )}
      <section class="panel team-summary">
        <div class="progress-wrap">
          <p class="brush-title">Lista de retos</p>
          <div class="progress-label">
            <span>${done}/${total} fotos</span>
            <strong>${percent}%</strong>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
        </div>
        <div class="pending-box">
          <button class="primary" type="button" data-action="sync-pending" ${pendingCount && state.online ? "" : "disabled"}>Subir guardadas (${pendingCount})</button>
          <p class="muted small">Si una foto se toma sin internet, queda guardada en este celular. Cuando vuelva la señal, este botón la sube a Online.</p>
        </div>
      </section>
      <section class="item-list">
        ${state.items.map(renderTeamItem).join("") || `<div class="panel admin-section"><p class="muted">No hay items en la checklist.</p></div>`}
      </section>
    `);
  }

  function renderTeamItem(item, index) {
    const remotePhoto = state.photos.find((photo) => photo.item_id === item.id);
    const pendingPhoto = state.pending.find((photo) => photo.itemId === item.id);
    const current = pendingPhoto || remotePhoto;
    const source = pendingPhoto ? "pending" : "remote";
    const preview = current && current.previewUrl;
    const status = pendingPhoto
      ? `<span class="status-pill warn">Pendiente de subir</span>`
      : remotePhoto
        ? `<span class="status-pill">Foto subida</span>`
        : `<span class="status-pill offline">Sin foto</span>`;

    return `
      <article class="item-card">
        <div>
          <div class="item-head">
            <div class="challenge-check" aria-hidden="true">${current ? "✓" : ""}</div>
            <h2 class="item-title"><span>${index + 1}.</span> ${escapeHtml(item.title)}</h2>
            ${status}
          </div>
          <p class="muted small">${current && current.uploaded_at ? core.formatDate(current.uploaded_at) : ""}</p>
        </div>
        ${preview ? `<img class="photo-preview clickable-photo" src="${escapeAttr(preview)}" alt="Foto de ${escapeAttr(item.title)}" data-action="view-photo" data-item-id="${escapeAttr(item.id)}" data-source="${source}">` : `<div class="photo-empty">Sin foto</div>`}
        <div class="item-actions">
          ${preview ? `<button class="secondary" type="button" data-action="view-photo" data-item-id="${escapeAttr(item.id)}" data-source="${source}">Ver</button>` : ""}
          <button class="primary" type="button" data-action="take-photo" data-item-id="${escapeAttr(item.id)}" ${disabled()}>${preview ? "Reemplazar" : "Tomar foto"}</button>
          ${preview ? `<button class="danger" type="button" data-action="delete-team-photo" data-item-id="${escapeAttr(item.id)}" ${disabled()}>Eliminar</button>` : ""}
        </div>
      </article>
    `;
  }

  function renderAdmin() {
    if (!state.admin) return renderAdminLogin();
    const selected = state.selectedTeam || (state.teams[0] && state.teams[0].name) || "";
    const teamTabs = state.teams.map((team) => {
      const total = state.items.length;
      const count = state.photos.filter((photo) => photo.team_name === team.name).length;
      return `
        <div class="team-card ${selected === team.name ? "active" : ""}">
          <button class="team-tab" type="button" data-action="select-team" data-team-name="${escapeAttr(team.name)}">
            <strong>${escapeHtml(team.name)}</strong>
            <span class="muted small">${count}/${total} fotos</span>
          </button>
          <details class="team-menu">
            <summary aria-label="Opciones de ${escapeAttr(team.name)}"><span aria-hidden="true">⋮</span></summary>
            <div class="team-menu-panel" role="menu">
              <button type="button" role="menuitem" data-action="edit-team" data-team-name="${escapeAttr(team.name)}" ${disabled()}>Editar</button>
              <button class="danger" type="button" role="menuitem" data-action="delete-team" data-team-name="${escapeAttr(team.name)}" ${disabled()}>Eliminar</button>
            </div>
          </details>
        </div>
      `;
    }).join("");

    app.innerHTML = layout(`
      ${topbar(
        "Admin",
        `
          <span class="status-pill">${hasRemote ? "Online" : "Demo local"}</span>
          <button class="secondary" type="button" data-action="refresh-admin" ${disabled()}>Refrescar</button>
          <button class="ghost" type="button" data-action="logout-admin">Salir</button>
        `
      )}
      <section class="admin-layout">
        <aside class="panel admin-section">
          <div class="item-head">
            <h2>Equipos</h2>
            <button class="primary compact-button" type="button" data-action="new-team" ${disabled()}>Crear</button>
          </div>
          <div class="team-tabs">${teamTabs || `<p class="muted">Aun no hay equipos.</p>`}</div>
        </aside>
        <div class="admin-grid">
          <section class="panel admin-section">
            <h2>${selected ? escapeHtml(selected) : "Revisión"}</h2>
            <div class="admin-photo-grid">
              ${selected ? state.items.map((item) => renderAdminPhoto(selected, item)).join("") : `<p class="muted">Selecciona un equipo.</p>`}
            </div>
          </section>
          <details class="panel admin-section challenge-settings">
            <summary>
              <span>
                <strong>Lista de retos</strong>
                <small>La misma lista para todos los equipos</small>
              </span>
              <span>Editar</span>
            </summary>
            <div class="item-head">
              <p class="muted small">Editar un item elimina las fotos subidas para ese item.</p>
              <button class="primary" type="button" data-action="add-item" ${disabled()}>Agregar</button>
            </div>
            <div class="editor-list">
              ${state.items.map(renderEditorItem).join("") || `<p class="muted">No hay items.</p>`}
            </div>
          </details>
        </div>
      </section>
    `);
  }

  function renderAdminPhoto(teamName, item) {
    const photo = state.photos.find((entry) => entry.team_name === teamName && entry.item_id === item.id);
    return `
      <article class="admin-photo">
        <h3>${escapeHtml(item.title)}</h3>
        ${photo ? `<img class="photo-preview clickable-photo" src="${escapeAttr(photo.previewUrl)}" alt="Foto de ${escapeAttr(item.title)}" data-action="view-photo" data-item-id="${escapeAttr(item.id)}">` : `<div class="photo-empty">Sin foto</div>`}
        ${photo ? `
          <button class="secondary" type="button" data-action="view-photo" data-item-id="${escapeAttr(item.id)}">Ver</button>
          <button class="danger" type="button" data-action="admin-delete-photo" data-item-id="${escapeAttr(item.id)}" data-team-name="${escapeAttr(teamName)}" ${disabled()}>Borrar foto</button>
        ` : ""}
      </article>
    `;
  }

  function renderEditorItem(item) {
    return `
      <article class="editor-row">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <p class="muted small">Version ${item.version || 1}</p>
        </div>
        <div class="editor-actions">
          <button class="secondary" type="button" data-action="edit-item" data-item-id="${escapeAttr(item.id)}" ${disabled()}>Editar</button>
          <button class="danger" type="button" data-action="delete-item" data-item-id="${escapeAttr(item.id)}" ${disabled()}>Borrar</button>
        </div>
      </article>
    `;
  }

  function layout(content) {
    return `
      <main class="screen">
        ${content}
      </main>
      ${renderModal()}
      ${renderBusy()}
      <div class="toast ${state.toast ? "show" : ""}">${escapeHtml(state.toast)}</div>
    `;
  }

  function renderBusy() {
    if (!state.busy) return "";
    return `
      <div class="loading-backdrop" role="status" aria-live="polite">
        <div class="loading-card">
          <span class="spinner" aria-hidden="true"></span>
          <strong>${escapeHtml(state.busyMessage || "Cargando...")}</strong>
        </div>
      </div>
    `;
  }

  function topbar(title, actions) {
    return `
      <header class="topbar">
        <div class="brand">
          <img class="brand-mark" src="assets/logo.png" alt="">
          <div>
            <h1>${title}</h1>
            <p>CAOS Camp 2 · Rally de fotos</p>
          </div>
        </div>
        <div class="top-actions">${actions}</div>
      </header>
    `;
  }

  function renderModal() {
    if (!state.modal) return "";
    if (state.modal.type === "teamForm") {
      const isEdit = Boolean(state.modal.teamName);
      return `
        <div class="modal-backdrop open" data-action="close-modal">
          <section class="panel modal" role="dialog" aria-modal="true">
            <h2>${isEdit ? "Editar equipo" : "Crear equipo"}</h2>
            <form data-action="save-team">
              <div class="form-row">
                <label for="teamFormName">Nombre</label>
                <input id="teamFormName" name="teamName" autocomplete="off" placeholder="Equipo 1" value="${escapeAttr(state.modal.teamName || "")}">
              </div>
              <div class="form-row">
                <label for="teamFormPin">PIN de acceso</label>
                <input id="teamFormPin" name="teamPin" inputmode="numeric" type="text" autocomplete="off" placeholder="1234" value="${escapeAttr(state.modal.pin || "")}">
              </div>
              <div class="modal-actions">
                <button class="ghost" type="button" data-action="close-modal">Cancelar</button>
                <button class="primary" type="submit" ${disabled()}>${isEdit ? "Guardar" : "Crear"}</button>
              </div>
            </form>
          </section>
        </div>
      `;
    }
    if (state.modal.type === "confirm") {
      return `
        <div class="modal-backdrop open" data-action="close-modal">
          <section class="panel modal" role="dialog" aria-modal="true">
            <h2>${escapeHtml(state.modal.title || "Confirmar")}</h2>
            <p class="modal-copy">${escapeHtml(state.modal.message || "Esta accion no se puede deshacer.")}</p>
            <div class="modal-actions">
              <button class="ghost" type="button" data-action="close-modal">Cancelar</button>
              <button class="${state.modal.danger ? "danger" : "primary"}" type="button" data-action="confirm-modal" ${disabled()}>${escapeHtml(state.modal.confirmLabel || "Confirmar")}</button>
            </div>
          </section>
        </div>
      `;
    }
    return `
      <div class="modal-backdrop open" data-action="close-modal">
        <section class="panel modal" role="dialog" aria-modal="true">
          <img src="${escapeAttr(state.modal.url)}" alt="${escapeAttr(state.modal.title)}">
          <div class="form-row">
            <button class="secondary" type="button" data-action="close-modal">Cerrar</button>
          </div>
        </section>
      </div>
    `;
  }

  function openCamera(itemId) {
    state.cameraItemId = itemId;
    cameraInput.value = "";
    cameraInput.click();
  }

  function openPhoto(itemId, source) {
    const item = state.items.find((entry) => entry.id === itemId);
    let photo;
    if (source === "pending") {
      photo = state.pending.find((entry) => entry.itemId === itemId);
    } else if (state.mode === "admin") {
      photo = state.photos.find((entry) => entry.team_name === state.selectedTeam && entry.item_id === itemId);
    } else {
      photo = state.photos.find((entry) => entry.item_id === itemId);
    }
    if (!photo || !photo.previewUrl) return;
    state.modal = { type: "photo", url: photo.previewUrl, title: item ? item.title : "Foto" };
    render();
  }

  function deleteTeamPhoto(itemId) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    confirmModal({
      title: "Eliminar foto",
      message: `Se borrará la foto de "${item.title}".`,
      confirmLabel: "Eliminar",
      danger: true,
      onConfirm: () => run(async () => {
        const pending = state.pending.find((entry) => entry.itemId === itemId);
        if (pending) await deletePendingPhoto(core.photoKey(state.teamName, itemId));
        const remotePhoto = state.photos.find((entry) => entry.item_id === itemId);
        if (remotePhoto) await store.deletePhoto(remotePhoto);
        await loadTeam();
        toast("Foto eliminada.");
      }, "Eliminando foto...")
    });
  }

  function adminDeletePhoto(itemId, teamName) {
    const photo = state.photos.find((entry) => entry.team_name === teamName && entry.item_id === itemId);
    if (!photo) return;
    confirmModal({
      title: "Borrar foto",
      message: `Se borrará esta foto de ${teamName}.`,
      confirmLabel: "Borrar",
      danger: true,
      onConfirm: () => run(async () => {
        await store.deletePhoto(photo);
        await loadAdmin();
        toast("Foto borrada.");
      }, "Borrando foto...")
    });
  }

  function openTeamForm(teamName) {
    const currentName = teamName ? core.normalizeTeamName(teamName) : "";
    const team = state.teams.find((entry) => entry.name === currentName);
    closeTeamMenus();
    state.modal = { type: "teamForm", teamName: currentName, pin: team && team.pin ? team.pin : "" };
    render();
  }

  function deleteTeam(teamName) {
    const name = core.normalizeTeamName(teamName);
    confirmModal({
      title: "Eliminar equipo",
      message: `Se eliminará ${name} y todas sus fotos.`,
      confirmLabel: "Eliminar",
      danger: true,
      onConfirm: () => run(async () => {
        await store.deleteTeam(name);
        await deletePendingForTeam(name);
        if (state.teamName === name) {
          state.teamName = "";
          state.teamPin = "";
          localStorage.removeItem("teamName");
          localStorage.removeItem("teamPin");
        }
        state.selectedTeam = "";
        await loadAdmin();
        toast("Equipo eliminado.");
      }, "Eliminando equipo...")
    });
  }

  function addItem() {
    const title = prompt("Nuevo item de checklist");
    if (!title || !title.trim()) return;
    run(async () => {
      await store.addItem(title.trim());
      await loadAdmin();
      toast("Item agregado.");
    });
  }

  function editItem(itemId) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    const title = prompt("Editar item", item.title);
    if (!title || !title.trim() || title.trim() === item.title) return;
    confirmModal({
      title: "Editar reto",
      message: "Editar este reto eliminará las fotos subidas para este reto en todos los equipos.",
      confirmLabel: "Editar",
      danger: true,
      onConfirm: () => run(async () => {
        await store.updateItem(item, title.trim());
        await deletePendingForItem(item.id);
        await loadAdmin();
        toast("Item actualizado.");
      }, "Actualizando reto...")
    });
  }

  function deleteItem(itemId) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    confirmModal({
      title: "Borrar reto",
      message: `Se borrará "${item.title}" y sus fotos en todos los equipos.`,
      confirmLabel: "Borrar",
      danger: true,
      onConfirm: () => run(async () => {
        await store.deleteItem(item);
        await deletePendingForItem(item.id);
        await loadAdmin();
        toast("Item borrado.");
      }, "Borrando reto...")
    });
  }

  function confirmModal(options) {
    state.modal = { type: "confirm", ...options };
    render();
  }

  async function syncPendingPhotos() {
    if (hasRemote && !navigator.onLine) {
      toast("Sin internet.");
      return;
    }
    const items = core.sortItems(await store.listItems());
    const pending = await listPendingPhotos(state.teamName);
    let uploaded = 0;
    for (const entry of pending) {
      const item = items.find((candidate) => candidate.id === entry.itemId);
      if (!item || Number(item.version || 1) !== Number(entry.itemVersion || 1)) {
        await deletePendingPhoto(entry.key);
        continue;
      }
      await store.uploadPhoto({ teamName: state.teamName, item, blob: entry.blob });
      await deletePendingPhoto(entry.key);
      uploaded += 1;
    }
    await loadTeam();
    toast(uploaded ? `${uploaded} foto(s) subida(s).` : "No había fotos vigentes para subir.");
  }

  function toast(message) {
    state.toast = message;
    render();
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => {
      state.toast = "";
      render();
    }, 3000);
  }

  function closeTeamMenus(except) {
    document.querySelectorAll(".team-menu[open]").forEach((menu) => {
      if (menu !== except) menu.removeAttribute("open");
    });
  }

  function disabled() {
    return state.busy ? "disabled" : "";
  }

  function createRemoteStore() {
    return {
      async listItems() {
        const { data, error } = await supabase.from("items").select("*").order("position", { ascending: true });
        if (error) throw error;
        return data || [];
      },
      async listTeams() {
        const { data, error } = await supabase.from("teams").select("name,pin,created_at").order("name", { ascending: true });
        if (error) throw friendlySupabaseError(error);
        return data || [];
      },
      async verifyTeamAccess(teamName, pin) {
        const name = core.normalizeTeamName(teamName);
        const accessPin = core.normalizePin(pin);
        const { data, error } = await supabase.from("teams").select("name,pin").eq("name", name).maybeSingle();
        if (error) throw friendlySupabaseError(error);
        if (!data || String(data.pin) !== accessPin) throw new Error("Equipo o PIN incorrecto.");
      },
      async createTeam({ name, pin }) {
        const { error } = await supabase.from("teams").insert({
          name: core.normalizeTeamName(name),
          pin: core.normalizePin(pin)
        });
        if (error) throw friendlySupabaseError(error);
      },
      async updateTeam(oldName, { name, pin }) {
        const { error } = await supabase
          .from("teams")
          .update({ name: core.normalizeTeamName(name), pin: core.normalizePin(pin) })
          .eq("name", oldName);
        if (error) throw friendlySupabaseError(error);
      },
      async deleteTeam(teamName) {
        const { data, error } = await supabase.from("photos").select("storage_path").eq("team_name", teamName);
        if (error) throw error;
        const paths = (data || []).map((photo) => photo.storage_path).filter(Boolean);
        await removeStoragePaths(paths);
        const { error: deleteError } = await supabase.from("teams").delete().eq("name", teamName);
        if (deleteError) throw deleteError;
      },
      async listPhotos(teamName) {
        const { data, error } = await supabase.from("photos").select("*").eq("team_name", core.normalizeTeamName(teamName));
        if (error) throw error;
        return withPublicUrls(data || []);
      },
      async listAllPhotos() {
        const { data, error } = await supabase.from("photos").select("*").order("team_name", { ascending: true });
        if (error) throw error;
        return withPublicUrls(data || []);
      },
      async uploadPhoto({ teamName, item, blob }) {
        const name = core.normalizeTeamName(teamName);
        const existing = await findPhoto(name, item.id);
        if (existing) await this.deletePhoto(existing);
        const path = `${slug(name)}/${item.id}/${Date.now()}-${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, {
          contentType: "image/jpeg",
          upsert: false
        });
        if (uploadError) throw uploadError;
        const { error } = await supabase.from("photos").insert({
          team_name: name,
          item_id: item.id,
          item_version: item.version || 1,
          storage_path: path,
          uploaded_at: new Date().toISOString()
        });
        if (error) {
          try {
            await removeStoragePaths([path]);
          } catch (cleanupError) {
            throw new Error(`No se pudo registrar la foto ni limpiar storage: ${cleanupError.message || cleanupError}`);
          }
          throw error;
        }
      },
      async deletePhoto(photo) {
        await removeStoragePaths([photo.storage_path]);
        const query = photo.id
          ? supabase.from("photos").delete().eq("id", photo.id)
          : supabase.from("photos").delete().eq("team_name", photo.team_name).eq("item_id", photo.item_id);
        const { error } = await query;
        if (error) throw error;
      },
      async deletePhotosForItem(itemId) {
        const { data, error } = await supabase.from("photos").select("id,storage_path").eq("item_id", itemId);
        if (error) throw error;
        const paths = (data || []).map((photo) => photo.storage_path).filter(Boolean);
        await removeStoragePaths(paths);
        const { error: deleteError } = await supabase.from("photos").delete().eq("item_id", itemId);
        if (deleteError) throw deleteError;
      },
      async addItem(title) {
        const items = await this.listItems();
        const position = items.reduce((max, item) => Math.max(max, item.position || 0), 0) + 1;
        const { error } = await supabase.from("items").insert({ title, position, version: 1 });
        if (error) throw error;
      },
      async updateItem(item, title) {
        await this.deletePhotosForItem(item.id);
        const { error } = await supabase
          .from("items")
          .update({ title, version: Number(item.version || 1) + 1 })
          .eq("id", item.id);
        if (error) throw error;
      },
      async deleteItem(item) {
        await this.deletePhotosForItem(item.id);
        const { error } = await supabase.from("items").delete().eq("id", item.id);
        if (error) throw error;
      }
    };
  }

  async function findPhoto(teamName, itemId) {
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .eq("team_name", teamName)
      .eq("item_id", itemId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  function withPublicUrls(photos) {
    return photos.map((photo) => ({
      ...photo,
      previewUrl: supabase.storage.from(bucket).getPublicUrl(photo.storage_path).data.publicUrl
    }));
  }

  async function removeStoragePaths(paths) {
    const cleanPaths = [...new Set(paths.filter(Boolean))];
    if (!cleanPaths.length) return;
    const { error } = await supabase.storage.from(bucket).remove(cleanPaths);
    if (error) throw error;
  }

  function friendlySupabaseError(error) {
    const message = String(error && error.message || "");
    if (/pin/i.test(message) && /(column|schema|not find|does not exist)/i.test(message)) {
      return new Error("Falta aplicar la migración de PIN en Supabase. Ejecuta el ALTER TABLE indicado en el README.");
    }
    return error;
  }

  function createDemoStore() {
    return {
      async listItems() {
        return getDemoItems();
      },
      async listTeams() {
        return getDemoTeams();
      },
      async verifyTeamAccess(teamName, pin) {
        const name = core.normalizeTeamName(teamName);
        const accessPin = core.normalizePin(pin);
        const team = getDemoTeams().find((entry) => entry.name === name);
        if (!team || String(team.pin) !== accessPin) throw new Error("Equipo o PIN incorrecto.");
      },
      async createTeam({ name, pin }) {
        localStorage.setItem(
          "demoTeams",
          JSON.stringify([...getDemoTeams(), { name: core.normalizeTeamName(name), pin: core.normalizePin(pin) }])
        );
      },
      async updateTeam(oldName, { name, pin }) {
        const newName = core.normalizeTeamName(name);
        const newPin = core.normalizePin(pin);
        localStorage.setItem(
          "demoTeams",
          JSON.stringify(getDemoTeams().map((team) => (team.name === oldName ? { name: newName, pin: newPin } : team)))
        );
        if (oldName === newName) return;
        const photos = await idbAll("demoPhotos");
        await Promise.all(
          photos
            .filter((photo) => photo.team_name === oldName)
            .map((photo) => idbDelete("demoPhotos", photo.key).then(() => idbPut("demoPhotos", {
              ...photo,
              key: core.photoKey(newName, photo.item_id),
              team_name: newName,
              storage_path: `demo/${core.photoKey(newName, photo.item_id)}`
            })))
        );
      },
      async deleteTeam(teamName) {
        localStorage.setItem("demoTeams", JSON.stringify(getDemoTeams().filter((team) => team.name !== teamName)));
        const photos = await idbAll("demoPhotos");
        await Promise.all(photos.filter((photo) => photo.team_name === teamName).map((photo) => idbDelete("demoPhotos", photo.key)));
      },
      async listPhotos(teamName) {
        const photos = await idbAll("demoPhotos");
        return photos
          .filter((photo) => photo.team_name === core.normalizeTeamName(teamName))
          .map(withObjectUrl);
      },
      async listAllPhotos() {
        const photos = await idbAll("demoPhotos");
        return photos.map(withObjectUrl);
      },
      async uploadPhoto({ teamName, item, blob }) {
        const name = core.normalizeTeamName(teamName);
        await idbPut("demoPhotos", {
          key: core.photoKey(name, item.id),
          team_name: name,
          item_id: item.id,
          item_version: item.version || 1,
          storage_path: `demo/${core.photoKey(name, item.id)}`,
          uploaded_at: new Date().toISOString(),
          blob
        });
      },
      async deletePhoto(photo) {
        await idbDelete("demoPhotos", core.photoKey(photo.team_name, photo.item_id));
      },
      async deletePhotosForItem(itemId) {
        const photos = await idbAll("demoPhotos");
        await Promise.all(photos.filter((photo) => photo.item_id === itemId).map((photo) => idbDelete("demoPhotos", photo.key)));
      },
      async addItem(title) {
        const items = getDemoItems();
        const position = items.reduce((max, item) => Math.max(max, item.position || 0), 0) + 1;
        setDemoItems([...items, { id: crypto.randomUUID(), title, position, version: 1 }]);
      },
      async updateItem(item, title) {
        await this.deletePhotosForItem(item.id);
        const items = getDemoItems().map((entry) =>
          entry.id === item.id ? { ...entry, title, version: Number(entry.version || 1) + 1 } : entry
        );
        setDemoItems(items);
      },
      async deleteItem(item) {
        await this.deletePhotosForItem(item.id);
        setDemoItems(getDemoItems().filter((entry) => entry.id !== item.id));
      }
    };
  }

  function getDemoItems() {
    const saved = localStorage.getItem("demoItems");
    if (saved && localStorage.getItem("demoSeedVersion") === demoSeedVersion) return JSON.parse(saved);
    const seed = initialItems.map((title, index) => ({ id: `caos-${index + 1}`, title, position: index + 1, version: 1 }));
    setDemoItems(seed);
    localStorage.setItem("demoSeedVersion", demoSeedVersion);
    return seed;
  }

  function setDemoItems(items) {
    localStorage.setItem("demoItems", JSON.stringify(core.sortItems(items)));
  }

  function getDemoTeams() {
    const saved = localStorage.getItem("demoTeams");
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((team, index) => ({ ...team, pin: team.pin || String(index + 1).repeat(4) }));
    }
    const teams = ["Equipo 1", "Equipo 2", "Equipo 3", "Equipo 4"].map((name, index) => ({ name, pin: String(index + 1).repeat(4) }));
    localStorage.setItem("demoTeams", JSON.stringify(teams));
    return teams;
  }

  function withObjectUrl(photo) {
    return {
      ...photo,
      previewUrl: URL.createObjectURL(photo.blob)
    };
  }

  async function savePendingPhoto({ teamName, item, blob }) {
    const name = core.normalizeTeamName(teamName);
    await idbPut("pendingPhotos", {
      key: core.photoKey(name, item.id),
      teamName: name,
      itemId: item.id,
      itemVersion: item.version || 1,
      createdAt: new Date().toISOString(),
      blob
    });
  }

  async function listPendingPhotos(teamName) {
    const name = core.normalizeTeamName(teamName);
    const photos = await idbAll("pendingPhotos");
    return photos
      .filter((photo) => photo.teamName === name)
      .map((photo) => ({
        ...photo,
        uploaded_at: photo.createdAt,
        previewUrl: URL.createObjectURL(photo.blob)
      }));
  }

  async function deletePendingPhoto(key) {
    await idbDelete("pendingPhotos", key);
  }

  async function deletePendingForItem(itemId) {
    const photos = await idbAll("pendingPhotos");
    await Promise.all(photos.filter((photo) => photo.itemId === itemId).map((photo) => idbDelete("pendingPhotos", photo.key)));
  }

  async function deletePendingForTeam(teamName) {
    const photos = await idbAll("pendingPhotos");
    await Promise.all(photos.filter((photo) => photo.teamName === teamName).map((photo) => idbDelete("pendingPhotos", photo.key)));
  }

  async function renamePendingTeam(oldName, newName) {
    const photos = await idbAll("pendingPhotos");
    await Promise.all(
      photos
        .filter((photo) => photo.teamName === oldName)
        .map((photo) => idbDelete("pendingPhotos", photo.key).then(() => idbPut("pendingPhotos", {
          ...photo,
          key: core.photoKey(newName, photo.itemId),
          teamName: newName
        })))
    );
  }

  function openDb() {
    if (openDb.promise) return openDb.promise;
    openDb.promise = new Promise((resolve, reject) => {
      const request = indexedDB.open("equipos-fotos", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("pendingPhotos")) db.createObjectStore("pendingPhotos", { keyPath: "key" });
        if (!db.objectStoreNames.contains("demoPhotos")) db.createObjectStore("demoPhotos", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return openDb.promise;
  }

  async function idbAll(storeName) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function idbPut(storeName, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function fileToJpegBlob(file) {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("No se pudo procesar la foto."));
        }, "image/jpeg", 0.82);
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("No se pudo leer la imagen."));
      image.src = url;
    });
  }

  function slug(value) {
    return core.normalizeTeamName(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function cameraIcon() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"></path>
        <circle cx="12" cy="13" r="3"></circle>
      </svg>
    `;
  }
})();

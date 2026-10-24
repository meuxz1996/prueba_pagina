/* ============================================================================
 * SW-GPP-001 v1.0 - Lógica de la aplicación (SPA con rutas por hash)
 * Requiere data.js (loadDB, saveDB, hashPassword, validatePasswordPolicy,
 * resetDatabaseToSeed, PRODUCT_CATEGORIES, PRODUCT_IMAGE_PRESETS, SESSION_KEY).
 * Todos los elementos interactivos tienen id / name / data-testid estables
 * para automatizar con Selenium.
 * ============================================================================ */
(function () {
    'use strict';

    const MAX_INTENTOS = 5;               // RN-04
    const BLOQUEO_MIN = 15;               // RN-04
    const INACTIVIDAD_SEG = 10 * 60;      // RNF-03 / RN-22
    const PRECIO_MAX = 10000;             // RN-07

    const actions = {}, forms = {}, changes = {}, inputs = {};   // manejadores delegados
    function migrate(d) { (d.productos || []).forEach(p => { if (!p.codigo) p.codigo = 'PRD-' + p.id_producto; }); return d; }
    let db = migrate(loadDB());
    let session = null;                   // { userId, last }
    let flashMsg = null;                  // { text, type }
    let cart = JSON.parse(sessionStorage.getItem('gpp_cart') || '[]');

    /* ------------------------------ Utilidades ------------------------------ */
    const $ = (s, r = document) => r.querySelector(s);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = n => '$' + Number(n).toLocaleString('es-CO');
    const pad = n => String(n).padStart(2, '0');
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
    const nextId = (arr, key) => arr.reduce((m, x) => Math.max(m, Number(x[key]) || 0), 0) + 1;
    const save = () => saveDB(db);
    const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    const user = () => session ? db.usuarios.find(u => u.id_usuario === session.userId) : null;
    const isClient = u => u && u.rol === 'Cliente';
    const fullName = u => `${u.nombre} ${u.apellido}`;

    function flash(text, type = 'info') { flashMsg = { text, type }; const el = $('#flash'); if (el) el.outerHTML = flashHtml(); }
    function flashHtml() {
        if (!flashMsg) return '<div id="flash" data-testid="flash" class="hidden"></div>';
        const c = { success: 'bg-emerald-50 border-emerald-400 text-emerald-900', error: 'bg-red-50 border-red-400 text-red-900', warning: 'bg-amber-50 border-amber-400 text-amber-900', info: 'bg-blue-50 border-blue-400 text-blue-900' }[flashMsg.type];
        return `<div id="flash" data-testid="flash" data-type="${flashMsg.type}" role="alert" class="mb-4 p-3 border-l-4 rounded ${c}">${esc(flashMsg.text)}</div>`;
    }
    function formError(msg) {
        const el = $('#form-error');
        if (el) { el.textContent = msg; el.classList.remove('hidden'); el.scrollIntoView({ block: 'nearest' }); }
        else flash(msg, 'error');
    }
    function logHist(modulo, accion, estado, observacion, id_pedido = null, cliente = 'N/A') {
        const u = user();
        db.historial.push({
            id_historial: nextId(db.historial, 'id_historial'), fecha: today(), hora: nowTime(),
            usuario: u ? fullName(u) : 'Sistema', cliente, id_pedido, modulo, accion, estado, observacion
        });
    }
    function logError(codigo, modulo, mensaje) {
        const u = user();
        db.logs_errores.push({ id_log: nextId(db.logs_errores, 'id_log'), fecha: `${today()} ${nowTime()}`, codigo, modulo, mensaje, usuario: u ? fullName(u) : 'Anónimo' });
    }
    const badge = (t, color) => `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}">${esc(t)}</span>`;
    const estadoBadge = e => badge(e, { Pendiente: 'bg-amber-100 text-amber-800', Confirmado: 'bg-emerald-100 text-emerald-800', Cancelado: 'bg-red-100 text-red-800' }[e] || 'bg-slate-100 text-slate-700');

    /* ------------------------------- Modal ------------------------------- */
    function openModal(title, body) {
        $('#modal-title').textContent = title;
        $('#modal-body').innerHTML = body;
        const m = $('#modal'); m.classList.remove('hidden'); m.classList.add('flex');
        const f = $('#modal-body input, #modal-body select, #modal-body textarea'); if (f) f.focus();
    }
    function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.classList.remove('flex'); $('#modal-body').innerHTML = ''; }
    function confirmDialog(title, text, onYes) {
        confirmCb = onYes;
        openModal(title, `<p id="confirm-text" class="mb-5">${esc(text)}</p>
            <div class="flex justify-end gap-2">
                <button type="button" id="confirm-no" data-testid="confirm-no" data-action="closeModal" class="px-4 py-2 rounded bg-slate-200">Cancelar</button>
                <button type="button" id="confirm-yes" data-testid="confirm-yes" data-action="confirmYes" class="px-4 py-2 rounded bg-red-600 text-white">Confirmar</button>
            </div>`);
    }
    let confirmCb = null;

    /* ------------------------------ Sesión ------------------------------ */
    function loadSession() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
            const s0 = JSON.parse(raw || 'null');
            const u = s0 && db.usuarios.find(x => x.id_usuario === s0.userId && x.estado);
            if (u && (Date.now() - s0.last) / 1000 < INACTIVIDAD_SEG && (!u.sesion_token || u.sesion_token === s0.token)) {
                session = s0;
                sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
            } else {
                session = null;
                sessionStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(SESSION_KEY);
                // Limpiar banderas de sesión huérfanas para no bloquear el inicio de sesión
                let changed = false;
                db.usuarios.forEach(x => { if (x.sesion_activa || x.sesion_token) { x.sesion_activa = false; x.sesion_token = null; changed = true; } });
                if (changed) save();
            }
        } catch (e) { session = null; }
    }
    let lastSync = 0;
    function touch() {
        if (!session) return;
        session.last = Date.now();
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        const u = user(); if (u && Date.now() - lastSync > 5000) { lastSync = Date.now(); u.sesion_ultima = Date.now(); save(); }
    }
    function logout(reason, auto) {
        const u = user();
        if (u) {
            u.sesion_activa = false; u.sesion_token = null;
            logHist('Autenticación', auto ? 'Cierre de sesión por inactividad' : 'Cierre de sesión', 'Cerrada', reason || 'Cierre de sesión manual');
        }
        // Asegurar limpieza total de sesiones activas en almacenamiento
        db.usuarios.forEach(x => { if (!u || x.id_usuario === u.id_usuario) { x.sesion_activa = false; x.sesion_token = null; } });
        save();
        session = null;
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
        cart = [];
        sessionStorage.removeItem('gpp_cart'); // RF-04: limpia la información en memoria
        flashMsg = auto ? { text: 'Su sesión expiró por inactividad (10 minutos). Inicie sesión nuevamente.', type: 'warning' } : { text: 'Sesión cerrada correctamente.', type: 'success' };
        location.hash = '#/login';
        render();
    }
    function remaining() { return session ? Math.max(0, Math.ceil(INACTIVIDAD_SEG - (Date.now() - session.last) / 1000)) : INACTIVIDAD_SEG; }
    setInterval(() => {
        if (!session) return;
        if (remaining() <= 0) { logout('Cierre automático por 10 minutos de inactividad', true); return; }
        const t = $('#inactivity-timer'); if (t) t.textContent = `${pad(Math.floor(remaining() / 60))}:${pad(remaining() % 60)}`;
    }, 1000);
    let lastTouch = 0;
    ['click', 'keydown', 'mousemove', 'scroll'].forEach(ev => document.addEventListener(ev, () => { if (Date.now() - lastTouch > 1000) { lastTouch = Date.now(); touch(); } }, true));

    /* ------------------------------ Layouts ------------------------------ */
    function publicLayout(inner) {
        const u = user();
        return `<header class="bg-blue-900 text-white"><div class="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <a href="#/catalogo" id="brand" class="font-bold text-lg">Comercializadora ABC S.A.S.</a>
            <nav class="flex items-center gap-3 text-sm">
                <a href="#/catalogo" id="nav-catalogo" data-testid="nav-catalogo" class="underline">Catálogo</a>
                ${u ? `<a href="${isClient(u) ? '#/cliente/catalogo' : '#/admin/dashboard'}" id="nav-panel" data-testid="nav-panel" class="underline">Mi panel</a>`
                    : `<a href="#/login" id="nav-login" data-testid="nav-login" class="bg-white text-blue-900 px-3 py-1 rounded font-semibold">Iniciar sesión</a>`}
            </nav></div></header>
            <main class="max-w-7xl mx-auto p-4 sm:p-6">${flashHtml()}${inner}</main>`;
    }
    const ADMIN_NAV = [['dashboard', 'Panel principal'], ['usuarios', 'Usuarios'], ['productos', 'Productos'], ['pedidos', 'Pedidos'], ['historial', 'Historial'], ['pagos', 'Medios de pago'], ['reportes', 'Reportes']];
    const CLIENT_NAV = [['catalogo', 'Catálogo'], ['carrito', `Carrito (${cart.reduce((s, i) => s + i.cantidad, 0)})`], ['pedidos', 'Mis pedidos']];
    function panelLayout(area, sec, inner) {
        const u = user(); const nav = area === 'admin' ? ADMIN_NAV : CLIENT_NAV;
        return `<div class="flex flex-col lg:flex-row min-h-screen">
          <aside class="lg:w-64 bg-white border-r shrink-0 flex flex-col justify-between">
            <div>
              <div class="p-4 border-b"><h1 class="font-bold">Comercializadora ABC</h1><p class="text-xs text-slate-500">${area === 'admin' ? 'Panel Administrativo' : 'Portal de Cliente'}</p></div>
              <nav class="p-3 flex lg:flex-col gap-1 overflow-x-auto" aria-label="Navegación principal">
                ${nav.map(([k, l]) => `<a href="#/${area}/${k}" id="nav-${k}" data-testid="nav-${k}" class="px-3 py-2 rounded-lg text-sm whitespace-nowrap ${k === sec ? 'bg-blue-700 text-white font-semibold' : 'hover:bg-slate-100'}">${l}</a>`).join('')}
                <a href="#/catalogo" id="nav-publico" data-testid="nav-publico" class="px-3 py-2 rounded-lg text-sm hover:bg-slate-100 whitespace-nowrap">Catálogo público</a>
              </nav>
            </div>
            <div class="p-4 border-t bg-slate-50 text-sm space-y-2">
              <div><p id="session-user-name" data-testid="session-user-name" class="font-semibold">${esc(fullName(u))}</p>
                   <p id="session-user-email" class="text-xs text-slate-500">${esc(u.correo)}</p>
                   <p id="session-user-role" data-testid="session-user-role" class="text-xs text-slate-500">${esc(u.rol)}</p></div>
              <p class="text-xs">Inactividad: <span id="inactivity-timer" data-testid="inactivity-timer" class="font-mono font-bold">${pad(Math.floor(remaining() / 60))}:${pad(remaining() % 60)}</span></p>
              <button type="button" id="btn-logout" data-testid="btn-logout" data-action="logout" class="w-full py-2 rounded bg-red-600 text-white font-semibold">Cerrar sesión</button>
            </div>
          </aside>
          <main class="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-auto"><div class="max-w-6xl mx-auto">${flashHtml()}${inner}</div></main></div>`;
    }
    const th = (...c) => `<thead class="bg-slate-100 text-left text-xs uppercase text-slate-600"><tr>${c.map(x => `<th class="px-3 py-2">${x}</th>`).join('')}</tr></thead>`;
    const field = (label, id, input, hint = '') => `<div><label for="${id}" class="block text-sm font-semibold mb-1">${label}</label>${input}${hint ? `<p class="text-xs text-slate-500 mt-1">${hint}</p>` : ''}</div>`;
    const inp = (id, extra = '') => `id="${id}" name="${id}" data-testid="${id}" class="w-full border rounded px-3 py-2 text-sm" ${extra}`;

    /* ============================== LOGIN ============================== */
    function viewLogin() {
        if (!window.RN21_STRICT) {
            let cleaned = false;
            db.usuarios.forEach(x => { if (x.sesion_activa || x.sesion_token) { x.sesion_activa = false; x.sesion_token = null; cleaned = true; } });
            if (cleaned) save();
        }
        return `<main class="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-100 to-blue-100">
        <div class="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div class="bg-blue-800 text-white p-6 text-center"><h1 class="text-xl font-bold">Comercializadora ABC S.A.S.</h1><p class="text-sm text-blue-100">Sistema Web para la Gestión de Productos y Pedidos</p></div>
          <div class="p-6">
            ${flashHtml()}
            <div id="login-error" data-testid="login-error" role="alert" class="hidden mb-4 p-3 border-l-4 border-red-400 bg-red-50 text-red-900 rounded text-sm"></div>
            <form id="login-form" data-form="login" novalidate class="space-y-4">
              ${field('Correo electrónico *', 'email', `<input type="email" ${inp('email', 'autocomplete="username" placeholder="correo@empresa.com"')}>`)}
              ${field('Contraseña *', 'password', `<input type="password" ${inp('password', 'autocomplete="current-password"')}>`)}
              <button type="submit" id="btn-login" data-testid="btn-login" class="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2 rounded">Iniciar sesión</button>
            </form>
            <div class="flex justify-between mt-4 text-sm">
              <a href="#" id="link-recover" data-testid="link-recover" data-action="openRecovery" class="text-blue-700 underline">¿Olvidó su contraseña?</a>
              <a href="#/catalogo" id="link-catalogo" data-testid="link-catalogo" class="text-blue-700 underline">Ver catálogo como visitante</a>
            </div>
            <div class="mt-4 pt-3 border-t text-center">
              <button type="button" id="btn-unlock-reset" data-testid="btn-unlock-reset" data-action="unlockFromLogin" class="text-xs text-slate-500 hover:text-slate-800 underline">Desbloquear cuentas / Liberar sesiones de prueba</button>
            </div>
          </div></div></main>`;
    }
    actions.unlockFromLogin = function () {
        db.usuarios.forEach(u => { u.intentos_fallidos = 0; u.bloqueado_hasta = null; u.sesion_activa = false; u.sesion_token = null; });
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
        save();
        flash('Cuentas desbloqueadas y sesiones liberadas correctamente.', 'success');
        render();
    };
    forms.login = function () {
        const email = $('#email').value.trim(), pass = $('#password').value;
        const err = m => { const e = $('#login-error'); e.textContent = m; e.classList.remove('hidden'); };
        if (!email) return err('El correo electrónico es obligatorio.');
        if (!emailOk(email)) return err('El formato del correo electrónico no es válido.');
        if (!pass) return err('La contraseña es obligatoria.');
        const u = db.usuarios.find(x => x.correo.toLowerCase() === email.toLowerCase());
        if (!u) { logError('ERR-AUTH', 'Autenticación', `Intento de acceso con correo no registrado: ${email}`); save(); return err('Correo o contraseña incorrectos.'); }
        if (u.bloqueado_hasta) {
            const hasta = new Date(u.bloqueado_hasta);
            if (hasta > new Date()) return err(`La cuenta está bloqueada temporalmente por intentos fallidos. Intente nuevamente a las ${pad(hasta.getHours())}:${pad(hasta.getMinutes())}.`);
            u.bloqueado_hasta = null; u.intentos_fallidos = 0;
        }
        if (u.contraseña !== hashPassword(pass)) {
            u.intentos_fallidos++;
            logError('ERR-AUTH', 'Autenticación', `Contraseña incorrecta para ${u.correo} (intento ${u.intentos_fallidos})`);
            if (u.intentos_fallidos >= MAX_INTENTOS) {
                u.bloqueado_hasta = new Date(Date.now() + BLOQUEO_MIN * 60000).toISOString();
                save();
                return err(`Cuenta bloqueada por ${BLOQUEO_MIN} minutos tras ${MAX_INTENTOS} intentos fallidos.`);
            }
            save();
            return err(`Correo o contraseña incorrectos. Intentos restantes: ${MAX_INTENTOS - u.intentos_fallidos}.`);
        }
        if (!u.estado) { logError('ERR-RN05', 'Autenticación', `Acceso rechazado, usuario inactivo: ${u.correo}`); save(); return err('El usuario está inactivo. Contacte al administrador.'); }
        // RN-21: no puede existir más de una sesión activa por administrador
        if (!isClient(u) && window.RN21_STRICT && u.sesion_activa && u.sesion_token && (Date.now() - (u.sesion_ultima || 0)) / 1000 < INACTIVIDAD_SEG) {
            logError('ERR-RN21', 'Autenticación', `Intento de segunda sesión activa para ${u.correo}`); save();
            return err('El usuario ya tiene una sesión activa. Cierre la otra sesión o espere a que expire por inactividad.');
        }
        const token = Math.random().toString(36).slice(2) + Date.now();
        // Invalidar cualquier sesión previa para garantizar sesión única (RN-21) sin bloquear al usuario
        db.usuarios.forEach(x => { if (x.id_usuario === u.id_usuario) { x.sesion_activa = false; x.sesion_token = null; } });
        u.intentos_fallidos = 0; u.bloqueado_hasta = null; u.sesion_activa = true; u.sesion_token = token; u.sesion_ultima = Date.now();
        u.ultimo_acceso = `${today()} ${nowTime()}`;
        session = { userId: u.id_usuario, last: Date.now(), token };
        touch(); logHist('Autenticación', 'Inicio de sesión', 'Activa', `Ingreso exitoso de ${u.correo}`);
        save();
        flashMsg = { text: `Bienvenido, ${fullName(u)}.`, type: 'success' };
        location.hash = isClient(u) ? '#/cliente/catalogo' : '#/admin/dashboard';
        render();
    };
    actions.openRecovery = function () {
        openModal('Recuperar contraseña', `<form id="recovery-form" data-form="recovery" novalidate class="space-y-4">
            <div id="form-error" data-testid="form-error" role="alert" class="hidden p-3 bg-red-50 border-l-4 border-red-400 text-red-900 rounded text-sm"></div>
            ${field('Correo registrado *', 'rec-email', `<input type="email" ${inp('rec-email')}>`)}
            <div class="flex justify-end gap-2"><button type="button" data-action="closeModal" class="px-4 py-2 rounded bg-slate-200">Cancelar</button>
            <button type="submit" id="btn-recover" data-testid="btn-recover" class="px-4 py-2 rounded bg-blue-700 text-white">Enviar enlace</button></div></form>`);
    };
    forms.recovery = function () {
        const email = $('#rec-email').value.trim();
        if (!email) return formError('El correo electrónico es obligatorio.');
        if (!emailOk(email)) return formError('El formato del correo electrónico no es válido.');
        const u = db.usuarios.find(x => x.correo.toLowerCase() === email.toLowerCase() && x.estado);
        const msg = 'Si el correo está registrado, recibirá un enlace de recuperación (simulado abajo).';
        if (!u) { logHist('Autenticación', 'Solicitud de recuperación', 'Sin coincidencia', `Correo no registrado: ${email}`); save(); $('#modal-body').innerHTML = `<p id="recovery-message" data-testid="recovery-message" class="p-3 bg-blue-50 rounded">${msg}</p>`; return; }
        const token = Math.random().toString(36).slice(2, 10);
        db.recuperaciones.push({ correo: u.correo, token, fecha: `${today()} ${nowTime()}`, usado: false });
        logHist('Autenticación', 'Solicitud de recuperación', 'Enviada', `Enlace generado para ${u.correo}`); save();
        $('#modal-body').innerHTML = `<p id="recovery-message" data-testid="recovery-message" class="p-3 bg-blue-50 rounded mb-4">${msg}</p>
            <form id="reset-form" data-form="reset" novalidate class="space-y-3">
              <p class="text-xs text-slate-500">Simulación del enlace recibido por correo (token ${esc(token)}).</p>
              <input type="hidden" id="reset-email" value="${esc(u.correo)}"><input type="hidden" id="reset-token" value="${token}">
              <div id="form-error" data-testid="form-error" role="alert" class="hidden p-3 bg-red-50 border-l-4 border-red-400 text-red-900 rounded text-sm"></div>
              ${field('Nueva contraseña *', 'new-password', `<input type="password" ${inp('new-password')}>`, 'Mínimo 8 caracteres, una mayúscula, una minúscula y un número.')}
              ${field('Confirmar contraseña *', 'confirm-password', `<input type="password" ${inp('confirm-password')}>`)}
              <div class="text-right"><button type="submit" id="btn-reset" data-testid="btn-reset" class="px-4 py-2 rounded bg-blue-700 text-white">Cambiar contraseña</button></div></form>`;
    };
    forms.reset = function () {
        const p = $('#new-password').value, c = $('#confirm-password').value;
        if (!validatePasswordPolicy(p).valid) return formError('La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.');
        if (p !== c) return formError('Las contraseñas no coinciden.');
        const rec = db.recuperaciones.find(r => r.token === $('#reset-token').value && !r.usado);
        const u = db.usuarios.find(x => x.correo === $('#reset-email').value);
        if (!rec || !u) return formError('El enlace de recuperación no es válido o ya fue usado.');
        u.contraseña = hashPassword(p); u.intentos_fallidos = 0; u.bloqueado_hasta = null; rec.usado = true;
        logHist('Autenticación', 'Cambio de contraseña', 'Exitoso', `Contraseña restablecida para ${u.correo}`); save();
        closeModal(); flash('Contraseña actualizada correctamente. Ya puede iniciar sesión.', 'success');
    };

    /* ============================ CATÁLOGO ============================ */
    function catalogCards(mode) {
        const q = ($('#filter-q') || {}).value || '', cat = ($('#filter-cat') || {}).value || '';
        const list = db.productos.filter(p => p.estado && (!cat || p.categoria === cat) && (!q || (p.nombre + p.descripcion).toLowerCase().includes(q.toLowerCase())));
        if (!list.length) return '<p id="catalog-empty" data-testid="catalog-empty" class="p-6 text-center text-slate-500">No se encontraron productos.</p>';
        return list.map(p => `<article class="bg-white rounded-xl shadow border p-4 flex flex-col" data-testid="product-card" data-product-id="${p.id_producto}">
            <img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" class="product-card-img rounded mb-3">
            <span class="text-xs text-slate-500">${esc(p.categoria)}</span>
            <h3 class="font-semibold">${esc(p.nombre)}</h3>
            <p class="text-sm text-slate-600 flex-1 mb-2">${esc(p.descripcion)}</p>
            <p class="font-bold text-emerald-700 mb-2" data-testid="product-price">${money(p.precio)}</p>
            ${mode === 'cliente' ? `<button type="button" id="add-cart-${p.id_producto}" data-testid="add-cart-${p.id_producto}" data-action="addCart" data-id="${p.id_producto}" class="bg-blue-700 text-white py-1.5 rounded">Agregar al carrito</button>` : ''}
        </article>`).join('');
    }
    function catalogFilters() {
        return `<div class="flex flex-wrap gap-3 mb-5">
            <input type="search" id="filter-q" data-testid="filter-q" data-change="refreshCatalog" placeholder="Buscar producto..." class="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]">
            <select id="filter-cat" data-testid="filter-cat" data-change="refreshCatalog" class="border rounded px-3 py-2 text-sm"><option value="">Todas las categorías</option>${PRODUCT_CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select></div>`;
    }
    changes.refreshCatalog = function () { const g = $('#catalog-grid'); if (g) g.innerHTML = catalogCards(g.dataset.mode); };
    function viewCatalogPublic() {
        return publicLayout(`<h1 class="text-2xl font-bold mb-1" id="page-title">Catálogo de productos</h1>
            <p class="text-sm text-slate-600 mb-4" id="visitor-note">${session ? '' : 'Está navegando como visitante: solo puede consultar el catálogo. Inicie sesión para realizar pedidos.'}</p>
            ${catalogFilters()}<div id="catalog-grid" data-testid="catalog-grid" data-mode="visitante" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">${catalogCards('visitante')}</div>`);
    }

    /* ============================ ADMIN: DASHBOARD ============================ */
    function admDashboard() {
        const c = (id, label, val) => `<div class="bg-white p-4 rounded-xl border shadow-sm"><p class="text-sm text-slate-500">${label}</p><p id="${id}" data-testid="${id}" class="text-3xl font-bold">${val}</p></div>`;
        return `<h1 class="text-2xl font-bold mb-4" id="page-title">Panel principal</h1>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            ${c('kpi-usuarios', 'Usuarios activos', db.usuarios.filter(u => u.estado).length)}
            ${c('kpi-productos', 'Productos activos', db.productos.filter(p => p.estado).length)}
            ${c('kpi-pendientes', 'Pedidos pendientes', db.pedidos.filter(p => p.estado === 'Pendiente').length)}
            ${c('kpi-confirmados', 'Pedidos confirmados', db.pedidos.filter(p => p.estado === 'Confirmado').length)}
        </div>
        <div class="mt-6 bg-white rounded-xl border p-4"><div class="flex justify-between items-center mb-2"><h2 class="font-bold">Datos de prueba</h2>
        <button type="button" id="btn-reset-db" data-testid="btn-reset-db" data-action="resetDb" class="px-3 py-1.5 text-sm rounded bg-slate-800 text-white">Restaurar datos iniciales</button></div>
        <p class="text-sm text-slate-600">Restablece usuarios, productos, pedidos e historial al estado original del caso de estudio (útil entre ejecuciones de pruebas automatizadas).</p></div>`;
    }
    actions.resetDb = () => confirmDialog('Restaurar datos', '¿Desea restaurar todos los datos al estado inicial? Se perderán los cambios.', () => {
        db = migrate(resetDatabaseToSeed()); cart = []; sessionStorage.removeItem('gpp_cart');
        session = null; flashMsg = { text: 'Datos restaurados. Inicie sesión nuevamente.', type: 'success' }; closeModal(); location.hash = '#/login'; render();
    });

    /* ============================ ADMIN: USUARIOS ============================ */
    function admUsuarios() {
        const me = user();
        return `<div class="flex justify-between items-center mb-4"><h1 class="text-2xl font-bold" id="page-title">Gestión de usuarios</h1>
        <button type="button" id="btn-new-user" data-testid="btn-new-user" data-action="userForm" class="bg-emerald-600 text-white px-4 py-2 rounded">Nuevo usuario</button></div>
        <div class="bg-white border rounded-xl overflow-x-auto"><table id="users-table" data-testid="users-table" class="min-w-full text-sm">${th('ID', 'Nombre', 'Correo', 'Rol', 'Estado', 'Último acceso', 'Acciones')}<tbody>
        ${db.usuarios.map(u => `<tr class="border-t" data-testid="user-row" data-user-id="${u.id_usuario}">
            <td class="px-3 py-2">${u.id_usuario}</td><td class="px-3 py-2">${esc(fullName(u))}</td><td class="px-3 py-2">${esc(u.correo)}</td>
            <td class="px-3 py-2">${esc(u.rol)}</td>
            <td class="px-3 py-2">${u.estado ? badge('Activo', 'bg-emerald-100 text-emerald-800') : badge('Inactivo', 'bg-slate-200 text-slate-700')}${u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date() ? ' ' + badge('Bloqueado', 'bg-red-100 text-red-800') : ''}</td>
            <td class="px-3 py-2" data-testid="user-last-access">${esc(u.ultimo_acceso || '-')}</td>
            <td class="px-3 py-2 whitespace-nowrap space-x-1">
              <button type="button" id="edit-user-${u.id_usuario}" data-testid="edit-user-${u.id_usuario}" data-action="userForm" data-id="${u.id_usuario}" class="px-2 py-1 rounded bg-blue-100 text-blue-800">Editar</button>
              <button type="button" id="toggle-user-${u.id_usuario}" data-testid="toggle-user-${u.id_usuario}" data-action="toggleUser" data-id="${u.id_usuario}" class="px-2 py-1 rounded bg-amber-100 text-amber-800">${u.estado ? 'Desactivar' : 'Activar'}</button>
              <button type="button" id="delete-user-${u.id_usuario}" data-testid="delete-user-${u.id_usuario}" data-action="deleteUser" data-id="${u.id_usuario}" class="px-2 py-1 rounded bg-red-100 text-red-800" ${u.id_usuario === me.id_usuario ? 'disabled title="No puede eliminar su propia cuenta"' : ''}>Eliminar</button>
            </td></tr>`).join('')}</tbody></table></div>`;
    }
    actions.userForm = function (el) {
        const id = el.dataset.id ? Number(el.dataset.id) : null; const u = id ? db.usuarios.find(x => x.id_usuario === id) : {};
        openModal(id ? 'Editar usuario' : 'Nuevo usuario', `<form id="user-form" data-form="user" data-id="${id || ''}" novalidate class="space-y-3">
            <div id="form-error" data-testid="form-error" role="alert" class="hidden p-3 bg-red-50 border-l-4 border-red-400 text-red-900 rounded text-sm"></div>
            <div class="grid grid-cols-2 gap-3">
              ${field('Nombre *', 'u-nombre', `<input type="text" ${inp('u-nombre', `value="${esc(u.nombre || '')}"`)}>`)}
              ${field('Apellido *', 'u-apellido', `<input type="text" ${inp('u-apellido', `value="${esc(u.apellido || '')}"`)}>`)}</div>
            ${field('Correo electrónico *', 'u-correo', `<input type="email" ${inp('u-correo', `value="${esc(u.correo || '')}"`)}>`)}
            ${field('Rol *', 'u-rol', `<select ${inp('u-rol', 'data-change="toggleClientField"')}><option value="Administrador" ${u.rol && u.rol !== 'Cliente' ? 'selected' : ''}>Administrador</option><option value="Cliente" ${u.rol === 'Cliente' ? 'selected' : ''}>Cliente</option></select>`)}
            <div id="u-cliente-wrap" class="${u.rol === 'Cliente' ? '' : 'hidden'}">${field('Cliente asociado', 'u-cliente', `<select ${inp('u-cliente')}>${db.clientes.map(c => `<option ${u.cliente_asociado === c.nombre ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>`)}</div>
            ${field(id ? 'Nueva contraseña (opcional)' : 'Contraseña *', 'u-password', `<input type="password" ${inp('u-password', 'autocomplete="new-password"')}>`, 'Mínimo 8 caracteres, una mayúscula, una minúscula y un número.')}
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="u-estado" name="u-estado" data-testid="u-estado" ${u.estado === false ? '' : 'checked'}> Usuario activo</label>
            <div class="flex justify-end gap-2"><button type="button" data-action="closeModal" id="btn-cancel" class="px-4 py-2 rounded bg-slate-200">Cancelar</button>
            <button type="submit" id="btn-save-user" data-testid="btn-save-user" class="px-4 py-2 rounded bg-emerald-600 text-white">Guardar</button></div></form>`);
    };
    changes.toggleClientField = el => $('#u-cliente-wrap').classList.toggle('hidden', el.value !== 'Cliente');
    forms.user = function (f) {
        const id = f.dataset.id ? Number(f.dataset.id) : null;
        const nombre = $('#u-nombre').value.trim(), apellido = $('#u-apellido').value.trim(), correo = $('#u-correo').value.trim().toLowerCase();
        const rol = $('#u-rol').value, pass = $('#u-password').value, estado = $('#u-estado').checked;
        if (!nombre || !apellido || !correo) return formError('Nombre, apellido y correo son obligatorios.');
        if (!emailOk(correo)) return formError('El formato del correo electrónico no es válido.');
        if (db.usuarios.some(x => x.correo.toLowerCase() === correo && x.id_usuario !== id)) { logError('ERR-RN01', 'Usuarios', `Correo duplicado: ${correo}`); save(); return formError('Ya existe un usuario con ese correo electrónico.'); }
        if (!id && !pass) return formError('La contraseña es obligatoria.');
        if (pass && !validatePasswordPolicy(pass).valid) return formError('La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.');
        if (id && id === user().id_usuario && !estado) return formError('No puede desactivar su propia cuenta.');
        const data = { nombre, apellido, correo, rol, estado, cliente_asociado: rol === 'Cliente' ? $('#u-cliente').value : undefined };
        if (id) {
            const u = db.usuarios.find(x => x.id_usuario === id); Object.assign(u, data); if (pass) u.contraseña = hashPassword(pass);
            logHist('Usuarios', 'Actualización de usuario', estado ? 'Activo' : 'Inactivo', `Usuario #${id} (${correo}) actualizado`);
        } else {
            const nid = nextId(db.usuarios, 'id_usuario');
            db.usuarios.push({ id_usuario: nid, ...data, contraseña: hashPassword(pass), intentos_fallidos: 0, bloqueado_hasta: null, sesion_activa: false, ultimo_acceso: null });
            logHist('Usuarios', 'Registro de usuario', 'Activo', `Usuario #${nid} (${correo}) creado con rol ${rol}`);
        }
        save(); closeModal(); flash(id ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.', 'success'); render();
    };
    actions.toggleUser = function (el) {
        const u = db.usuarios.find(x => x.id_usuario === Number(el.dataset.id));
        if (u.id_usuario === user().id_usuario) { flash('No puede desactivar su propia cuenta.', 'error'); return; }
        u.estado = !u.estado; if (!u.estado) u.sesion_activa = false;
        logHist('Usuarios', u.estado ? 'Activación de usuario' : 'Desactivación de usuario', u.estado ? 'Activo' : 'Inactivo', `Usuario #${u.id_usuario} (${u.correo})`); save();
        flash(`Usuario ${u.estado ? 'activado' : 'desactivado'} correctamente.`, 'success'); render();
    };
    actions.deleteUser = function (el) {
        const u = db.usuarios.find(x => x.id_usuario === Number(el.dataset.id));
        if (u.id_usuario === user().id_usuario) { flash('No puede eliminar su propia cuenta.', 'error'); return; }
        if (u.rol !== 'Cliente' && db.usuarios.filter(x => x.rol !== 'Cliente' && x.id_usuario !== u.id_usuario && x.estado).length === 0) { flash('Debe existir al menos un administrador activo.', 'error'); return; }
        confirmDialog('Eliminar usuario', `¿Desea eliminar al usuario ${u.correo}?`, () => {
            db.usuarios = db.usuarios.filter(x => x.id_usuario !== u.id_usuario);
            logHist('Usuarios', 'Eliminación de usuario', 'Eliminado', `Usuario #${u.id_usuario} (${u.correo})`); save(); closeModal(); flash('Usuario eliminado correctamente.', 'success'); render();
        });
    };

    /* ============================ ADMIN: PRODUCTOS ============================ */
    function admProductos() {
        return `<div class="flex justify-between items-center mb-4"><h1 class="text-2xl font-bold" id="page-title">Gestión de productos</h1>
        <button type="button" id="btn-new-product" data-testid="btn-new-product" data-action="productForm" class="bg-emerald-600 text-white px-4 py-2 rounded">Nuevo producto</button></div>
        <div class="flex flex-wrap gap-3 mb-4">
          <input type="search" id="filter-q" data-testid="filter-q" data-change="refreshProducts" placeholder="Buscar por nombre..." class="border rounded px-3 py-2 text-sm flex-1 min-w-[200px]">
          <select id="filter-cat" data-testid="filter-cat" data-change="refreshProducts" class="border rounded px-3 py-2 text-sm"><option value="">Todas las categorías</option>${PRODUCT_CATEGORIES.map(c => `<option>${c}</option>`).join('')}</select>
          <select id="filter-estado" data-testid="filter-estado" data-change="refreshProducts" class="border rounded px-3 py-2 text-sm"><option value="">Todos los estados</option><option value="1">Activos</option><option value="0">Inactivos</option></select></div>
        <div class="bg-white border rounded-xl overflow-x-auto"><table id="products-table" data-testid="products-table" class="min-w-full text-sm">${th('ID', 'Código', 'Producto', 'Categoría', 'Precio', 'Estado', 'Acciones')}<tbody id="products-body">${productRows()}</tbody></table></div>
        <div id="pager" data-testid="pager" class="flex items-center justify-end gap-3 mt-3 text-sm">${pagerHtml()}</div>`;
    }
    let productPage = 1; const PAGE_SIZE = 5;
    function filteredProducts() {
        const q = (($('#filter-q') || {}).value || '').toLowerCase(), cat = ($('#filter-cat') || {}).value || '', est = ($('#filter-estado') || {}).value || '';
        return db.productos.filter(p => (!q || (p.nombre + ' ' + p.codigo).toLowerCase().includes(q)) && (!cat || p.categoria === cat) && (!est || (est === '1') === p.estado));
    }
    function totalPages() { return Math.max(1, Math.ceil(filteredProducts().length / PAGE_SIZE)); }
    function productRows() {
        const list = filteredProducts(); if (productPage > totalPages()) productPage = totalPages();
        if (!list.length) return '<tr><td colspan="7" id="products-empty" data-testid="products-empty" class="px-3 py-6 text-center text-slate-500">No se encontraron productos.</td></tr>';
        return list.slice((productPage - 1) * PAGE_SIZE, productPage * PAGE_SIZE).map(p => `<tr class="border-t" data-testid="product-row" data-product-id="${p.id_producto}">
            <td class="px-3 py-2">${p.id_producto}</td><td class="px-3 py-2" data-testid="product-code">${esc(p.codigo)}</td>
            <td class="px-3 py-2"><div class="flex items-center gap-2"><img src="${esc(p.imagen)}" alt="" class="w-10 h-10 rounded object-cover"><span>${esc(p.nombre)}</span></div></td>
            <td class="px-3 py-2">${esc(p.categoria)}</td><td class="px-3 py-2">${money(p.precio)}</td>
            <td class="px-3 py-2">${p.estado ? badge('Activo', 'bg-emerald-100 text-emerald-800') : badge('Inactivo', 'bg-slate-200 text-slate-700')}</td>
            <td class="px-3 py-2 whitespace-nowrap space-x-1">
              <button type="button" id="edit-product-${p.id_producto}" data-testid="edit-product-${p.id_producto}" data-action="productForm" data-id="${p.id_producto}" class="px-2 py-1 rounded bg-blue-100 text-blue-800">Editar</button>
              <button type="button" id="toggle-product-${p.id_producto}" data-testid="toggle-product-${p.id_producto}" data-action="toggleProduct" data-id="${p.id_producto}" class="px-2 py-1 rounded bg-amber-100 text-amber-800">${p.estado ? 'Desactivar' : 'Activar'}</button>
              <button type="button" id="delete-product-${p.id_producto}" data-testid="delete-product-${p.id_producto}" data-action="deleteProduct" data-id="${p.id_producto}" class="px-2 py-1 rounded bg-red-100 text-red-800">Eliminar</button></td></tr>`).join('');
    }
    function pagerHtml() {
        return `<button type="button" id="page-prev" data-testid="page-prev" data-action="prevPage" class="px-3 py-1 rounded bg-slate-200" ${productPage <= 1 ? 'disabled' : ''}>Anterior</button>
            <span id="page-info" data-testid="page-info">Página ${productPage} de ${totalPages()}</span>
            <button type="button" id="page-next" data-testid="page-next" data-action="nextPage" class="px-3 py-1 rounded bg-slate-200" ${productPage >= totalPages() ? 'disabled' : ''}>Siguiente</button>`;
    }
    function refreshProductList() { $('#products-body').innerHTML = productRows(); $('#pager').innerHTML = pagerHtml(); }
    changes.refreshProducts = () => { productPage = 1; refreshProductList(); };
    actions.prevPage = () => { if (productPage > 1) { productPage--; refreshProductList(); } };
    actions.nextPage = () => { if (productPage < totalPages()) { productPage++; refreshProductList(); } };
    actions.productForm = function (el) {
        const id = el.dataset.id ? Number(el.dataset.id) : null; const p = id ? db.productos.find(x => x.id_producto === id) : {};
        openModal(id ? 'Editar producto' : 'Nuevo producto', `<form id="product-form" data-form="product" data-id="${id || ''}" novalidate class="space-y-3">
            <div id="form-error" data-testid="form-error" role="alert" class="hidden p-3 bg-red-50 border-l-4 border-red-400 text-red-900 rounded text-sm"></div>
            ${field('Código *', 'p-codigo', `<input type="text" ${inp('p-codigo', `value="${esc(p.codigo || '')}" ${id ? 'readonly' : 'placeholder="PRD-2001"'}`)}>`, id ? 'El código no puede modificarse.' : 'Código único del producto.')}
            ${field('Nombre *', 'p-nombre', `<input type="text" ${inp('p-nombre', `value="${esc(p.nombre || '')}"`)}>`)}
            ${field('Descripción *', 'p-descripcion', `<textarea rows="2" ${inp('p-descripcion')}>${esc(p.descripcion || '')}</textarea>`)}
            <div class="grid grid-cols-2 gap-3">
              ${field('Precio (COP) *', 'p-precio', `<input type="number" step="1" ${inp('p-precio', `value="${p.precio ?? ''}"`)}>`, `Máximo ${money(PRECIO_MAX)}.`)}
              ${field('Categoría *', 'p-categoria', `<select ${inp('p-categoria')}><option value="">Seleccione...</option>${PRODUCT_CATEGORIES.map(c => `<option ${p.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}</div>
            ${field('Imagen predefinida', 'p-preset', `<select ${inp('p-preset', 'data-change="presetImage"')}><option value="">Seleccione una imagen...</option>${PRODUCT_IMAGE_PRESETS.map(i => `<option value="${esc(i.url)}">${esc(i.label)}</option>`).join('')}</select>`)}
            ${field('URL de la imagen *', 'p-imagen', `<input type="url" ${inp('p-imagen', `value="${esc(p.imagen || '')}" placeholder="https://..."`)}>`)}
            ${field('Estado', 'p-estado', `<input type="text" ${inp('p-estado', `value="${p.estado === false ? 'Inactivo' : 'Activo'}" readonly`)}>`, id ? 'Use Activar/Desactivar en la lista (RF-12).' : 'Todo producto nuevo se registra activo (RN-09).')}
            <div class="flex justify-end gap-2"><button type="button" data-action="closeModal" id="btn-cancel" class="px-4 py-2 rounded bg-slate-200">Cancelar</button>
            <button type="submit" id="btn-save-product" data-testid="btn-save-product" class="px-4 py-2 rounded bg-emerald-600 text-white">Guardar</button></div></form>`);
    };
    changes.presetImage = el => { if (el.value) $('#p-imagen').value = el.value; };
    forms.product = function (f) {
        const id = f.dataset.id ? Number(f.dataset.id) : null;
        const nombre = $('#p-nombre').value.trim(), descripcion = $('#p-descripcion').value.trim(), precioRaw = $('#p-precio').value.trim();
        const categoria = $('#p-categoria').value, imagen = $('#p-imagen').value.trim();
        const codigo = $('#p-codigo').value.trim().toUpperCase();
        const estado = id ? db.productos.find(x => x.id_producto === id).estado : true;   // RN-09: no se registran productos inactivos
        if (!codigo) return formError('El código del producto es obligatorio.');
        if (!/^[A-Z0-9-]{3,20}$/.test(codigo)) return formError('El código solo admite letras, números y guiones (3 a 20 caracteres).');
        if (db.productos.some(x => x.codigo === codigo && x.id_producto !== id)) { logError('ERR-COD', 'Productos', `Código duplicado: ${codigo}`); save(); return formError('Ya existe un producto con ese código.'); }
        if (!nombre) return formError('El nombre del producto es obligatorio.');
        if (!descripcion) return formError('La descripción del producto es obligatoria.');
        if (precioRaw === '' || isNaN(Number(precioRaw))) return formError('El precio es obligatorio y debe ser numérico.');
        const precio = Number(precioRaw);
        if (precio <= 0) return formError('El precio debe ser mayor a cero.');
        if (precio > PRECIO_MAX) { logError('ERR-RN07', 'Productos', `Precio ${money(precio)} supera el máximo de ${money(PRECIO_MAX)}`); save(); return formError(`El precio no puede superar ${money(PRECIO_MAX)}.`); }
        if (!categoria) return formError('La categoría es obligatoria.');
        if (!imagen) return formError('La imagen del producto es obligatoria.');
        if (!/^https?:\/\//i.test(imagen)) return formError('La imagen debe ser una URL válida (http o https).');
        if (db.productos.some(p => p.nombre.toLowerCase() === nombre.toLowerCase() && p.id_producto !== id)) { logError('ERR-RN08', 'Productos', `Nombre duplicado: ${nombre}`); save(); return formError('Ya existe un producto con ese nombre.'); }
        if (id) {
            Object.assign(db.productos.find(p => p.id_producto === id), { nombre, descripcion, precio, categoria, imagen, estado });
            logHist('Productos', `Actualización de Producto #${id}`, estado ? 'Activo' : 'Inactivo', `Producto "${nombre}" actualizado (${money(precio)})`);
        } else {
            const nid = nextId(db.productos, 'id_producto');
            db.productos.push({ id_producto: nid, codigo, nombre, descripcion, precio, categoria, imagen, estado });
            logHist('Productos', `Registro de Producto #${nid}`, estado ? 'Activo' : 'Inactivo', `Producto "${nombre}" creado (${money(precio)})`);
        }
        save(); closeModal(); flash(id ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.', 'success'); render();
    };
    actions.toggleProduct = function (el) {
        const p = db.productos.find(x => x.id_producto === Number(el.dataset.id)); p.estado = !p.estado;
        logHist('Productos', p.estado ? `Activación de Producto #${p.id_producto}` : `Desactivación de Producto #${p.id_producto}`, p.estado ? 'Activo' : 'Inactivo', `Producto "${p.nombre}"`); save();
        flash(`Producto ${p.estado ? 'activado' : 'desactivado'} correctamente.`, 'success'); render();
    };
    actions.deleteProduct = function (el) {
        const p = db.productos.find(x => x.id_producto === Number(el.dataset.id));
        if (db.pedidos.some(o => o.items.some(i => i.id_producto === p.id_producto))) {
            logError('ERR-RF11', 'Productos', `Intento de eliminar producto #${p.id_producto} con pedidos asociados`); save();
            flash('No se puede eliminar el producto porque tiene pedidos asociados. Puede desactivarlo.', 'error'); return;
        }
        confirmDialog('Eliminar producto', `¿Desea eliminar el producto "${p.nombre}"?`, () => {
            db.productos = db.productos.filter(x => x.id_producto !== p.id_producto);
            logHist('Productos', `Eliminación de Producto #${p.id_producto}`, 'Eliminado', `Producto "${p.nombre}"`); save(); closeModal(); flash('Producto eliminado correctamente.', 'success'); render();
        });
    };

    /* ============================ PEDIDOS (admin + cliente) ============================ */
    function orderTable(list, area) {
        if (!list.length) return '<p id="orders-empty" data-testid="orders-empty" class="p-6 text-center text-slate-500">No hay pedidos para mostrar.</p>';
        return `<div class="bg-white border rounded-xl overflow-x-auto"><table id="orders-table" data-testid="orders-table" class="min-w-full text-sm">${th('N°', 'Fecha', 'Cliente', 'Medio de pago', 'Estado', 'Total', 'Acciones')}<tbody>
        ${list.slice().sort((a, b) => b.id_pedido - a.id_pedido).map(o => `<tr class="border-t" data-testid="order-row" data-order-id="${o.id_pedido}" data-estado="${o.estado}">
          <td class="px-3 py-2">${o.id_pedido}</td><td class="px-3 py-2">${o.fecha} ${o.hora}</td><td class="px-3 py-2">${esc(o.cliente)}</td><td class="px-3 py-2">${esc(o.medio_pago)}</td>
          <td class="px-3 py-2" data-testid="order-status">${estadoBadge(o.estado)}</td><td class="px-3 py-2">${money(o.total)}</td>
          <td class="px-3 py-2 whitespace-nowrap space-x-1">
            <button type="button" id="view-order-${o.id_pedido}" data-testid="view-order-${o.id_pedido}" data-action="viewOrder" data-id="${o.id_pedido}" class="px-2 py-1 rounded bg-slate-100">Ver</button>
            ${o.estado === 'Pendiente' ? `${area === 'admin' ? `<button type="button" id="edit-order-${o.id_pedido}" data-testid="edit-order-${o.id_pedido}" data-action="orderForm" data-id="${o.id_pedido}" class="px-2 py-1 rounded bg-blue-100 text-blue-800">Editar</button>
            <button type="button" id="confirm-order-${o.id_pedido}" data-testid="confirm-order-${o.id_pedido}" data-action="confirmOrder" data-id="${o.id_pedido}" class="px-2 py-1 rounded bg-emerald-100 text-emerald-800">Confirmar</button>` : ''}
            <button type="button" id="cancel-order-${o.id_pedido}" data-testid="cancel-order-${o.id_pedido}" data-action="cancelOrder" data-id="${o.id_pedido}" class="px-2 py-1 rounded bg-amber-100 text-amber-800">Cancelar</button>` : ''}
            ${area === 'admin' ? `<button type="button" id="delete-order-${o.id_pedido}" data-testid="delete-order-${o.id_pedido}" data-action="deleteOrder" data-id="${o.id_pedido}" class="px-2 py-1 rounded bg-red-100 text-red-800">Eliminar</button>` : ''}
          </td></tr>`).join('')}</tbody></table></div>`;
    }
    function admPedidos() {
        const est = ($('#filter-estado') || {}).value || '';
        return `<div class="flex justify-between items-center mb-4"><h1 class="text-2xl font-bold" id="page-title">Gestión de pedidos</h1>
        <button type="button" id="btn-new-order" data-testid="btn-new-order" data-action="orderForm" class="bg-emerald-600 text-white px-4 py-2 rounded">Nuevo pedido</button></div>
        <div class="mb-4"><select id="filter-estado" data-testid="filter-estado" data-change="rerender" class="border rounded px-3 py-2 text-sm">
          <option value="">Todos los estados</option>${['Pendiente', 'Confirmado', 'Cancelado'].map(s => `<option ${est === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        ${orderTable(db.pedidos.filter(o => !est || o.estado === est), 'admin')}`;
    }
    changes.rerender = () => { const v = ($('#filter-estado') || {}).value; render(); const s = $('#filter-estado'); if (s) s.value = v; };
    actions.viewOrder = function (el) {
        const o = db.pedidos.find(x => x.id_pedido === Number(el.dataset.id));
        openModal(`Pedido #${o.id_pedido}`, `<dl class="grid grid-cols-2 gap-2 text-sm mb-4">
          <dt class="font-semibold">Cliente</dt><dd>${esc(o.cliente)}</dd><dt class="font-semibold">Fecha</dt><dd>${o.fecha} ${o.hora}</dd>
          <dt class="font-semibold">Estado</dt><dd id="detail-estado">${estadoBadge(o.estado)}</dd><dt class="font-semibold">Medio de pago</dt><dd>${esc(o.medio_pago)}</dd>
          <dt class="font-semibold">Creado por</dt><dd>${esc(o.creado_por)}</dd><dt class="font-semibold">Observaciones</dt><dd>${esc(o.observaciones || '-')}</dd></dl>
          <table class="w-full text-sm border">${th('Producto', 'Precio', 'Cant.', 'Subtotal')}<tbody>${o.items.map(i => `<tr class="border-t"><td class="px-3 py-1">${esc(i.nombre)}</td><td class="px-3 py-1">${money(i.precio)}</td><td class="px-3 py-1">${i.cantidad}</td><td class="px-3 py-1">${money(i.precio * i.cantidad)}</td></tr>`).join('')}</tbody>
          <tfoot><tr class="border-t font-bold"><td colspan="3" class="px-3 py-2 text-right">Total</td><td class="px-3 py-2" id="detail-total">${money(o.total)}</td></tr></tfoot></table>`);
    };
    actions.orderForm = function (el) {
        const id = el.dataset.id ? Number(el.dataset.id) : null; const o = id ? db.pedidos.find(x => x.id_pedido === id) : { items: [] };
        const qty = pid => (o.items.find(i => i.id_producto === pid) || {}).cantidad || 0;
        const prods = db.productos.filter(p => p.estado || qty(p.id_producto));
        openModal(id ? `Editar pedido #${id}` : 'Nuevo pedido', `<form id="order-form" data-form="order" data-id="${id || ''}" novalidate class="space-y-3">
            <div id="form-error" data-testid="form-error" role="alert" class="hidden p-3 bg-red-50 border-l-4 border-red-400 text-red-900 rounded text-sm"></div>
            <div class="grid grid-cols-2 gap-3">
              ${field('Cliente *', 'o-cliente', `<select ${inp('o-cliente')}><option value="">Seleccione...</option>${db.clientes.map(c => `<option ${o.cliente === c.nombre ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select>`)}
              ${field('Medio de pago *', 'o-medio', `<select ${inp('o-medio')}><option value="">Seleccione...</option>${db.medios_pago.filter(m => m.activo || m.codigo === o.medio_pago).map(m => `<option value="${esc(m.codigo)}" ${o.medio_pago === m.codigo ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select>`)}</div>
            <div class="border rounded max-h-64 overflow-y-auto"><table class="w-full text-sm">${th('Producto', 'Precio', 'Cantidad')}<tbody>
              ${prods.map(p => `<tr class="border-t"><td class="px-3 py-1">${esc(p.nombre)}</td><td class="px-3 py-1">${money(p.precio)}</td>
              <td class="px-3 py-1"><input type="number" min="0" step="1" value="${qty(p.id_producto)}" id="qty-${p.id_producto}" name="qty-${p.id_producto}" data-testid="qty-${p.id_producto}" data-price="${p.precio}" data-pid="${p.id_producto}" data-input="orderTotal" class="w-20 border rounded px-2 py-1"></td></tr>`).join('')}</tbody></table></div>
            ${field('Observaciones', 'o-obs', `<textarea rows="2" ${inp('o-obs')}>${esc(o.observaciones || '')}</textarea>`)}
            <p class="text-right font-bold">Total: <span id="order-total" data-testid="order-total">${money(o.total || 0)}</span></p>
            <div class="flex justify-end gap-2"><button type="button" data-action="closeModal" id="btn-cancel" class="px-4 py-2 rounded bg-slate-200">Cancelar</button>
            <button type="submit" id="btn-save-order" data-testid="btn-save-order" class="px-4 py-2 rounded bg-emerald-600 text-white">Guardar pedido</button></div></form>`);
    };
    inputs.orderTotal = function () {
        let t = 0; document.querySelectorAll('#order-form [data-pid]').forEach(i => { t += (Number(i.value) || 0) * Number(i.dataset.price); });
        $('#order-total').textContent = money(t);
    };
    function readItems() {
        const items = [];
        document.querySelectorAll('#order-form [data-pid]').forEach(i => {
            const q = Number(i.value); if (q > 0) { const p = db.productos.find(x => x.id_producto === Number(i.dataset.pid)); items.push({ id_producto: p.id_producto, nombre: p.nombre, precio: p.precio, cantidad: q }); }
        });
        return items;
    }
    forms.order = function (f) {
        const id = f.dataset.id ? Number(f.dataset.id) : null;
        const cliente = $('#o-cliente').value, medio = $('#o-medio').value, obs = $('#o-obs').value.trim();
        if (!cliente) return formError('Debe seleccionar un cliente.');
        if (!medio) return formError('Debe seleccionar un medio de pago.');
        const bad = [...document.querySelectorAll('#order-form [data-pid]')].find(i => i.value !== '' && (Number(i.value) < 0 || !Number.isInteger(Number(i.value))));
        if (bad) return formError('Las cantidades deben ser números enteros positivos.');
        const items = readItems(); if (!items.length) return formError('El pedido debe tener al menos un producto.');
        const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
        if (id) {
            const o = db.pedidos.find(x => x.id_pedido === id);
            if (o.estado !== 'Pendiente') return formError('Solo se pueden modificar pedidos pendientes.');
            Object.assign(o, { cliente, medio_pago: medio, items, total, observaciones: obs });
            logHist('Pedidos', `Modificación de Pedido #${id}`, o.estado, `Pedido actualizado. Total ${money(total)}`, id, cliente);
        } else {
            const nid = nextId(db.pedidos, 'id_pedido');
            db.pedidos.push({ id_pedido: nid, fecha: today(), hora: nowTime(), cliente, estado: 'Pendiente', medio_pago: medio, creado_por: fullName(user()), items, total, observaciones: obs });
            logHist('Pedidos', `Registro de Pedido #${nid}`, 'Pendiente', `Pedido creado por ${money(total)} con ${medio}`, nid, cliente);
        }
        save(); closeModal(); flash(id ? 'Pedido actualizado correctamente.' : 'Pedido registrado correctamente.', 'success'); render();
    };
    actions.confirmOrder = function (el) {
        const o = db.pedidos.find(x => x.id_pedido === Number(el.dataset.id));
        if (o.estado !== 'Pendiente') { flash('Solo se pueden confirmar pedidos pendientes.', 'error'); return; }
        o.estado = 'Confirmado'; logHist('Pedidos', `Confirmación de Pedido #${o.id_pedido}`, 'Confirmado', 'Pedido confirmado', o.id_pedido, o.cliente); save();
        flash(`Pedido #${o.id_pedido} confirmado correctamente.`, 'success'); render();
    };
    actions.cancelOrder = function (el) {
        const o = db.pedidos.find(x => x.id_pedido === Number(el.dataset.id));
        if (o.estado === 'Confirmado') { logError('ERR-RN13', 'Pedidos', `Intento de cancelar pedido confirmado #${o.id_pedido}`); save(); flash('No se puede cancelar un pedido confirmado.', 'error'); return; }
        confirmDialog('Cancelar pedido', `¿Desea cancelar el pedido #${o.id_pedido}?`, () => {
            o.estado = 'Cancelado'; logHist('Pedidos', `Cancelación de Pedido #${o.id_pedido}`, 'Cancelado', 'Pedido cancelado antes de confirmación', o.id_pedido, o.cliente); save();
            closeModal(); flash(`Pedido #${o.id_pedido} cancelado correctamente.`, 'success'); render();
        });
    };
    actions.deleteOrder = function (el) {
        const o = db.pedidos.find(x => x.id_pedido === Number(el.dataset.id));
        if (o.estado === 'Confirmado') { logError('ERR-RN13', 'Pedidos', `Intento de eliminar pedido confirmado #${o.id_pedido}`); save(); flash('No se puede eliminar un pedido confirmado.', 'error'); return; }
        confirmDialog('Eliminar pedido', `¿Desea eliminar el pedido #${o.id_pedido}? El historial se conservará.`, () => {
            db.pedidos = db.pedidos.filter(x => x.id_pedido !== o.id_pedido);
            logHist('Pedidos', `Eliminación de Pedido #${o.id_pedido}`, 'Eliminado', 'Pedido eliminado; se conserva trazabilidad', o.id_pedido, o.cliente); save();
            closeModal(); flash(`Pedido #${o.id_pedido} eliminado correctamente.`, 'success'); render();
        });
    };

    /* ============================ ADMIN: HISTORIAL ============================ */
    function histRows() {
        const g = id => (($(id) || {}).value || '');
        const from = g('#filter-from'), to = g('#filter-to'), us = g('#filter-usuario'), es = g('#filter-estado'), cl = g('#filter-cliente').toLowerCase();
        const list = db.historial.filter(h => (!from || h.fecha >= from) && (!to || h.fecha <= to) && (!us || h.usuario === us) && (!es || h.estado === es) && (!cl || String(h.cliente).toLowerCase().includes(cl))).slice().reverse();
        const cnt = $('#history-count'); if (cnt) cnt.textContent = `${list.length} registro(s)`;
        return list.map(h => `<tr class="border-t" data-testid="history-row"><td class="px-3 py-2">${h.fecha}</td><td class="px-3 py-2">${h.hora}</td><td class="px-3 py-2">${esc(h.usuario)}</td><td class="px-3 py-2">${esc(h.cliente)}</td><td class="px-3 py-2">${esc(h.modulo)}</td><td class="px-3 py-2">${esc(h.accion)}</td><td class="px-3 py-2">${esc(h.estado)}</td><td class="px-3 py-2">${esc(h.observacion)}</td></tr>`).join('')
            || '<tr><td colspan="8" id="history-empty" data-testid="history-empty" class="px-3 py-6 text-center text-slate-500">No hay registros para los filtros seleccionados.</td></tr>';
    }
    changes.refreshHistory = () => { $('#history-body').innerHTML = histRows(); };
    function admHistorial() {
        const users = [...new Set(db.historial.map(h => h.usuario))], states = [...new Set(db.historial.map(h => h.estado))];
        return `<h1 class="text-2xl font-bold mb-1" id="page-title">Historial de operaciones</h1><p class="text-sm text-slate-500 mb-4">Registro de auditoría de solo lectura: no puede modificarse ni eliminarse.</p>
        <div class="bg-white border rounded-xl p-4 grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          ${field('Desde', 'filter-from', `<input type="date" ${inp('filter-from', 'data-change="refreshHistory"')}>`)}
          ${field('Hasta', 'filter-to', `<input type="date" ${inp('filter-to', 'data-change="refreshHistory"')}>`)}
          ${field('Usuario', 'filter-usuario', `<select ${inp('filter-usuario', 'data-change="refreshHistory"')}><option value="">Todos</option>${users.map(x => `<option>${esc(x)}</option>`).join('')}</select>`)}
          ${field('Estado', 'filter-estado', `<select ${inp('filter-estado', 'data-change="refreshHistory"')}><option value="">Todos</option>${states.map(x => `<option>${esc(x)}</option>`).join('')}</select>`)}
          ${field('Cliente', 'filter-cliente', `<input type="search" ${inp('filter-cliente', 'data-change="refreshHistory" placeholder="Nombre del cliente"')}>`)}</div>
        <div class="bg-white border rounded-xl overflow-x-auto"><table id="history-table" data-testid="history-table" class="min-w-full text-sm">${th('Fecha', 'Hora', 'Usuario', 'Cliente', 'Módulo', 'Acción', 'Estado', 'Observación')}<tbody id="history-body">${histRows()}</tbody></table></div>
        <p id="history-count" data-testid="history-count" class="text-sm text-slate-500 mt-2"></p>`;
    }

    /* ============================ ADMIN: MEDIOS DE PAGO ============================ */
    function admPagos() {
        return `<div class="flex justify-between items-center mb-4"><h1 class="text-2xl font-bold" id="page-title">Medios de pago</h1>
        <button type="button" id="btn-new-payment" data-testid="btn-new-payment" data-action="paymentForm" class="bg-emerald-600 text-white px-4 py-2 rounded">Nuevo medio de pago</button></div>
        <div class="bg-white border rounded-xl overflow-x-auto"><table id="payments-table" data-testid="payments-table" class="min-w-full text-sm">${th('ID', 'Código', 'Nombre', 'Descripción', 'Estado', 'Acciones')}<tbody>
        ${db.medios_pago.map(m => `<tr class="border-t" data-testid="payment-row" data-payment-id="${m.id_medio}"><td class="px-3 py-2">${m.id_medio}</td><td class="px-3 py-2">${esc(m.codigo)}</td><td class="px-3 py-2">${esc(m.nombre)}</td><td class="px-3 py-2">${esc(m.descripcion)}</td>
        <td class="px-3 py-2">${m.activo ? badge('Activo', 'bg-emerald-100 text-emerald-800') : badge('Inactivo', 'bg-slate-200 text-slate-700')}</td>
        <td class="px-3 py-2 space-x-1"><button type="button" id="edit-payment-${m.id_medio}" data-testid="edit-payment-${m.id_medio}" data-action="paymentForm" data-id="${m.id_medio}" class="px-2 py-1 rounded bg-blue-100 text-blue-800">Editar</button>
        <button type="button" id="toggle-payment-${m.id_medio}" data-testid="toggle-payment-${m.id_medio}" data-action="togglePayment" data-id="${m.id_medio}" class="px-2 py-1 rounded bg-amber-100 text-amber-800">${m.activo ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}</tbody></table></div>`;
    }
    actions.paymentForm = function (el) {
        const id = el.dataset.id ? Number(el.dataset.id) : null; const m = id ? db.medios_pago.find(x => x.id_medio === id) : {};
        openModal(id ? 'Editar medio de pago' : 'Nuevo medio de pago', `<form id="payment-form" data-form="payment" data-id="${id || ''}" novalidate class="space-y-3">
            <div id="form-error" data-testid="form-error" role="alert" class="hidden p-3 bg-red-50 border-l-4 border-red-400 text-red-900 rounded text-sm"></div>
            ${field('Código *', 'm-codigo', `<input type="text" ${inp('m-codigo', `value="${esc(m.codigo || '')}"`)}>`)}
            ${field('Nombre *', 'm-nombre', `<input type="text" ${inp('m-nombre', `value="${esc(m.nombre || '')}"`)}>`)}
            ${field('Descripción', 'm-descripcion', `<input type="text" ${inp('m-descripcion', `value="${esc(m.descripcion || '')}"`)}>`)}
            <div class="flex justify-end gap-2"><button type="button" data-action="closeModal" id="btn-cancel" class="px-4 py-2 rounded bg-slate-200">Cancelar</button>
            <button type="submit" id="btn-save-payment" data-testid="btn-save-payment" class="px-4 py-2 rounded bg-emerald-600 text-white">Guardar</button></div></form>`);
    };
    forms.payment = function (f) {
        const id = f.dataset.id ? Number(f.dataset.id) : null;
        const codigo = $('#m-codigo').value.trim(), nombre = $('#m-nombre').value.trim(), descripcion = $('#m-descripcion').value.trim();
        if (!codigo || !nombre) return formError('El código y el nombre son obligatorios.');
        const permitidos = ['crédito', 'credito', 'débito', 'debito', 'efectivo'];
        if (!permitidos.includes(codigo.toLowerCase())) {
            logError('ERR-RN19', 'Medios de pago', `Intento de registrar medio de pago no autorizado: ${codigo}`); save();
            return formError('RN-19: Los únicos medios de pago autorizados por la organización son Crédito, Débito y Efectivo.');
        }
        if (db.medios_pago.some(m => m.codigo.toLowerCase() === codigo.toLowerCase() && m.id_medio !== id)) return formError('Ya existe un medio de pago con ese código.');
        if (id) { Object.assign(db.medios_pago.find(m => m.id_medio === id), { codigo, nombre, descripcion }); logHist('Medios de pago', 'Actualización de medio de pago', 'Activo', `Medio "${nombre}"`); }
        else { db.medios_pago.push({ id_medio: nextId(db.medios_pago, 'id_medio'), codigo, nombre, descripcion, activo: true }); logHist('Medios de pago', 'Registro de medio de pago', 'Activo', `Medio "${nombre}"`); }
        save(); closeModal(); flash('Medio de pago guardado correctamente.', 'success'); render();
    };
    actions.togglePayment = function (el) {
        const m = db.medios_pago.find(x => x.id_medio === Number(el.dataset.id));
        if (m.activo && db.medios_pago.filter(x => x.activo).length <= 1) { flash('Debe existir al menos un medio de pago activo.', 'error'); return; }
        m.activo = !m.activo; logHist('Medios de pago', m.activo ? 'Activación de medio de pago' : 'Desactivación de medio de pago', m.activo ? 'Activo' : 'Inactivo', `Medio "${m.nombre}"`); save();
        flash(`Medio de pago ${m.activo ? 'activado' : 'desactivado'} correctamente.`, 'success'); render();
    };

    /* ============================ ADMIN: REPORTES ============================ */
    let lastReport = null;
    function admReportes() {
        return `<h1 class="text-2xl font-bold mb-4" id="page-title">Reportes</h1>
        <form id="report-form" data-form="report" class="bg-white border rounded-xl p-4 flex flex-wrap items-end gap-3 mb-4">
          ${field('Tipo de reporte', 'report-type', `<select ${inp('report-type')}><option value="productos">Productos</option><option value="pedidos">Pedidos</option><option value="ventas">Ventas</option><option value="actividad">Actividad de usuarios</option></select>`)}
          ${field('Desde', 'report-from', `<input type="date" ${inp('report-from')}>`)}${field('Hasta', 'report-to', `<input type="date" ${inp('report-to')}>`)}
          <button type="submit" id="btn-generate" data-testid="btn-generate" class="bg-blue-700 text-white px-4 py-2 rounded">Generar reporte</button></form>
        <div id="report-result" data-testid="report-result"></div>`;
    }
    forms.report = function () {
        const type = $('#report-type').value, from = $('#report-from').value, to = $('#report-to').value;
        if (from && to && from > to) { $('#report-result').innerHTML = '<p id="report-error" data-testid="report-error" role="alert" class="p-3 bg-red-50 border-l-4 border-red-400 text-red-900 rounded">La fecha inicial no puede ser posterior a la fecha final.</p>'; return; }
        const inRange = d => (!from || d >= from) && (!to || d <= to);
        let head, rows, title, summary = '';
        if (type === 'productos') { title = 'Reporte de productos'; head = ['ID', 'Producto', 'Categoría', 'Precio', 'Estado']; rows = db.productos.map(p => [p.id_producto, p.nombre, p.categoria, money(p.precio), p.estado ? 'Activo' : 'Inactivo']); }
        else if (type === 'pedidos') { title = 'Reporte de pedidos'; head = ['N°', 'Fecha', 'Cliente', 'Medio de pago', 'Estado', 'Total']; rows = db.pedidos.filter(o => inRange(o.fecha)).map(o => [o.id_pedido, o.fecha, o.cliente, o.medio_pago, o.estado, money(o.total)]); }
        else if (type === 'ventas') {
            title = 'Reporte de ventas (pedidos confirmados)'; head = ['N°', 'Fecha', 'Cliente', 'Medio de pago', 'Total'];
            const l = db.pedidos.filter(o => o.estado === 'Confirmado' && inRange(o.fecha)); rows = l.map(o => [o.id_pedido, o.fecha, o.cliente, o.medio_pago, money(o.total)]);
            summary = `<p class="font-bold mt-3">Total de ventas: <span id="report-total" data-testid="report-total">${money(l.reduce((s, o) => s + o.total, 0))}</span></p>`;
        } else { title = 'Reporte de actividad de usuarios'; head = ['Fecha', 'Hora', 'Usuario', 'Módulo', 'Acción', 'Estado']; rows = db.historial.filter(h => inRange(h.fecha)).map(h => [h.fecha, h.hora, h.usuario, h.modulo, h.accion, h.estado]); }
        lastReport = { title, head, rows };
        $('#report-result').innerHTML = `<div class="bg-white border rounded-xl p-4"><div class="flex justify-between items-center mb-3"><h2 class="font-bold" id="report-title">${title}</h2>
          <div class="space-x-2 no-print"><button type="button" id="btn-export-csv" data-testid="btn-export-csv" data-action="exportCsv" class="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm">Exportar CSV</button>
          <button type="button" id="btn-print" data-testid="btn-print" data-action="printReport" class="px-3 py-1.5 rounded bg-slate-700 text-white text-sm">Imprimir</button></div></div>
          ${rows.length ? `<div class="overflow-x-auto"><table id="report-table" data-testid="report-table" class="min-w-full text-sm">${th(...head)}<tbody>${rows.map(r => `<tr class="border-t" data-testid="report-row">${r.map(c => `<td class="px-3 py-2">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
          <p class="text-sm text-slate-500 mt-2" id="report-count">${rows.length} registro(s)</p>${summary}` : '<p id="report-empty" data-testid="report-empty" class="p-4 text-center text-slate-500">No hay datos para el rango seleccionado.</p>'}</div>`;
        logHist('Reportes', `Generación de ${title}`, 'Generado', `${rows.length} registro(s)`); save();
    };
    actions.exportCsv = function () {
        if (!lastReport) return;
        const csv = [lastReport.head, ...lastReport.rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
        a.download = `reporte_${lastReport.title.split(' ')[2] || 'datos'}_${today()}.csv`; document.body.appendChild(a); a.click(); a.remove();
        flash('Reporte exportado correctamente.', 'success');
    };
    actions.printReport = () => window.print();

    /* ============================ CLIENTE ============================ */
    function cliCatalogo() {
        return `<h1 class="text-2xl font-bold mb-4" id="page-title">Catálogo de productos</h1>${catalogFilters()}<div id="catalog-grid" data-testid="catalog-grid" data-mode="cliente" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">${catalogCards('cliente')}</div>`;
    }
    const saveCart = () => sessionStorage.setItem('gpp_cart', JSON.stringify(cart));
    actions.addCart = function (el) {
        const p = db.productos.find(x => x.id_producto === Number(el.dataset.id)); const it = cart.find(i => i.id_producto === p.id_producto);
        if (it) it.cantidad++; else cart.push({ id_producto: p.id_producto, cantidad: 1 });
        saveCart(); flash(`"${p.nombre}" agregado al carrito.`, 'success'); render();
    };
    function cliCarrito() {
        const lines = cart.map(i => ({ ...i, p: db.productos.find(x => x.id_producto === i.id_producto) })).filter(l => l.p && l.p.estado);
        const total = lines.reduce((s, l) => s + l.p.precio * l.cantidad, 0);
        if (!lines.length) return `<h1 class="text-2xl font-bold mb-4" id="page-title">Carrito</h1><p id="cart-empty" data-testid="cart-empty" class="p-6 text-center text-slate-500">Su carrito está vacío. <a href="#/cliente/catalogo" class="underline text-blue-700">Ir al catálogo</a></p>`;
        return `<h1 class="text-2xl font-bold mb-4" id="page-title">Carrito</h1>
        <div class="bg-white border rounded-xl overflow-x-auto mb-4"><table id="cart-table" data-testid="cart-table" class="min-w-full text-sm">${th('Producto', 'Precio', 'Cantidad', 'Subtotal', '')}<tbody>
        ${lines.map(l => `<tr class="border-t" data-testid="cart-row"><td class="px-3 py-2">${esc(l.p.nombre)}</td><td class="px-3 py-2">${money(l.p.precio)}</td>
        <td class="px-3 py-2"><input type="number" min="1" step="1" value="${l.cantidad}" id="cart-qty-${l.p.id_producto}" data-testid="cart-qty-${l.p.id_producto}" data-pid="${l.p.id_producto}" data-change="cartQty" class="w-20 border rounded px-2 py-1"></td>
        <td class="px-3 py-2">${money(l.p.precio * l.cantidad)}</td>
        <td class="px-3 py-2"><button type="button" id="remove-cart-${l.p.id_producto}" data-testid="remove-cart-${l.p.id_producto}" data-action="removeCart" data-id="${l.p.id_producto}" class="px-2 py-1 rounded bg-red-100 text-red-800">Quitar</button></td></tr>`).join('')}</tbody></table></div>
        <form id="checkout-form" data-form="checkout" novalidate class="bg-white border rounded-xl p-4 space-y-3 max-w-md">
          <div id="form-error" data-testid="form-error" role="alert" class="hidden p-3 bg-red-50 border-l-4 border-red-400 text-red-900 rounded text-sm"></div>
          ${field('Medio de pago *', 'c-medio', `<select ${inp('c-medio')}><option value="">Seleccione...</option>${db.medios_pago.filter(m => m.activo).map(m => `<option value="${esc(m.codigo)}">${esc(m.nombre)}</option>`).join('')}</select>`)}
          ${field('Observaciones', 'c-obs', `<textarea rows="2" ${inp('c-obs')}></textarea>`)}
          <p class="font-bold">Total: <span id="cart-total" data-testid="cart-total">${money(total)}</span></p>
          <button type="submit" id="btn-checkout" data-testid="btn-checkout" class="w-full bg-emerald-600 text-white py-2 rounded font-semibold">Confirmar pedido</button></form>`;
    }
    changes.cartQty = function (el) {
        const q = Number(el.value); const it = cart.find(i => i.id_producto === Number(el.dataset.pid));
        if (!Number.isInteger(q) || q < 1) { flash('La cantidad debe ser un número entero mayor a cero.', 'error'); render(); return; }
        it.cantidad = q; saveCart(); render();
    };
    actions.removeCart = function (el) { cart = cart.filter(i => i.id_producto !== Number(el.dataset.id)); saveCart(); flash('Producto quitado del carrito.', 'info'); render(); };
    forms.checkout = function () {
        const u = user(); const medio = $('#c-medio').value;
        if (!medio) return formError('Debe seleccionar un medio de pago.');
        const items = cart.map(i => { const p = db.productos.find(x => x.id_producto === i.id_producto); return p && p.estado ? { id_producto: p.id_producto, nombre: p.nombre, precio: p.precio, cantidad: i.cantidad } : null; }).filter(Boolean);
        if (!items.length) return formError('El carrito no tiene productos válidos.');
        const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0), nid = nextId(db.pedidos, 'id_pedido');
        db.pedidos.push({ id_pedido: nid, fecha: today(), hora: nowTime(), cliente: u.cliente_asociado, estado: 'Pendiente', medio_pago: medio, creado_por: fullName(u), items, total, observaciones: $('#c-obs').value.trim() });
        logHist('Pedidos', `Registro de Pedido #${nid}`, 'Pendiente', `Pedido de cliente por ${money(total)}`, nid, u.cliente_asociado);
        cart = []; saveCart(); save();
        flashMsg = { text: `Pedido #${nid} registrado correctamente. Estado: Pendiente.`, type: 'success' }; location.hash = '#/cliente/pedidos'; render();
    };
    function cliPedidos() {
        const u = user();
        return `<h1 class="text-2xl font-bold mb-4" id="page-title">Mis pedidos</h1>${orderTable(db.pedidos.filter(o => o.cliente === u.cliente_asociado), 'cliente')}`;
    }

    /* ============================ Router ============================ */
    const actions_ = null; // (reservado)
    function redirect(h) { if (location.hash !== h) location.hash = h; render(); }
    function render() {
        const app = $('#app'); const hash = location.hash || '#/login'; const parts = hash.replace(/^#\//, '').split('/');
        const area = parts[0], sec = parts[1] || '';
        const u = user();
        if (session && !u) { session = null; }
        if (area === 'catalogo') { app.innerHTML = viewCatalogPublic(); return; }
        if (area === 'login' || !area) {
            if (u) { return redirect(isClient(u) ? '#/cliente/catalogo' : '#/admin/dashboard'); }
            app.innerHTML = viewLogin(); return;
        }
        if (!u) { flashMsg = { text: 'Debe iniciar sesión para acceder a esta página.', type: 'warning' }; return redirect('#/login'); }
        if (area === 'admin') {
            if (isClient(u)) { return redirect('#/cliente/catalogo'); }
            const v = { dashboard: admDashboard, usuarios: admUsuarios, productos: admProductos, pedidos: admPedidos, historial: admHistorial, pagos: admPagos, reportes: admReportes }[sec];
            if (!v) { return redirect('#/admin/dashboard'); }
            app.innerHTML = panelLayout('admin', sec, v()); return;
        }
        if (area === 'cliente') {
            if (!isClient(u)) { return redirect('#/admin/dashboard'); }
            const v = { catalogo: cliCatalogo, carrito: cliCarrito, pedidos: cliPedidos }[sec];
            if (!v) { return redirect('#/cliente/catalogo'); }
            app.innerHTML = panelLayout('cliente', sec, v()); return;
        }
        location.hash = '#/login';
    }

    /* ============================ Eventos delegados ============================ */
    document.addEventListener('click', e => {
        flashMsg = null;
        const el = e.target.closest('[data-action]'); if (!el || el.disabled) return;
        e.preventDefault();
        const a = el.dataset.action;
        if (a === 'closeModal') return closeModal();
        if (a === 'confirmYes') { const cb = confirmCb; confirmCb = null; return cb && cb(); }
        if (a === 'logout') return logout('Cierre de sesión manual', false);
        actions[a] && actions[a](el);
    });
    document.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (!f) return; flashMsg = null; e.preventDefault(); forms[f.dataset.form](f); });
    document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && changes[el.dataset.change]) changes[el.dataset.change](el); });
    document.addEventListener('input', e => {
        const el = e.target.closest('[data-input]'); if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el);
        if (e.target.matches('input[data-change]:not([type=date]):not([type=number]):not([type=checkbox])') && changes[e.target.dataset.change]) changes[e.target.dataset.change](e.target);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closeModal(); });
    window.addEventListener('hashchange', () => { closeModal(); render(); });

    /* Ganchos auxiliares para pruebas automatizadas (opcional) */
    window.app = {
        forceInactivityTimeout() { if (session) { session.last = Date.now() - INACTIVIDAD_SEG * 1000 - 1000; sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } },
        resetData() { db = migrate(resetDatabaseToSeed()); session = null; cart = []; sessionStorage.removeItem('gpp_cart'); location.hash = '#/login'; render(); },
        unlockAccounts() { db.usuarios.forEach(u => { u.intentos_fallidos = 0; u.bloqueado_hasta = null; }); save(); }
    };

    loadSession();
    render();
})();

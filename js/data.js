/**
 * ============================================================================
 * SISTEMA WEB PARA LA GESTIÓN DE PRODUCTOS Y PEDIDOS (SW-GPP-001 v1.0)
 * Cliente: Comercializadora ABC S.A.S.
 * Desarrollador: SoftSolutions Colombia S.A.S.
 * Capa de Datos, Semilla Inicial, Cifrado Simulado y Persistencia LocalStorage
 * ============================================================================
 */

const STORAGE_KEY = 'SW_GPP_001_DB_V1';
const SESSION_KEY = 'SW_GPP_001_SESSION_V1';

/**
 * Simulación de algoritmo de cifrado/hash irreversible para contraseñas (RNF-01, RN-24)
 * Nunca se almacenan ni visualizan contraseñas en texto plano.
 */
function hashPassword(plainText) {
    let h1 = 0xdeadbeef ^ plainText.length;
    let h2 = 0x41c6ce57 ^ plainText.length;
    for (let i = 0, ch; i < plainText.length; i++) {
        ch = plainText.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
    return `bcrypt$2b$12$${btoa(plainText.slice(0, 2) + '_salt').replace(/=/g, '')}.${hex}`;
}

/**
 * Validador de política de contraseñas (RN-03):
 * - Mínimo 8 caracteres
 * - Al menos una letra mayúscula
 * - Al menos una letra minúscula
 * - Al menos un número
 */
function validatePasswordPolicy(password) {
    const minLength = password && password.length >= 8;
    const hasUpper = /[A-ZÁÉÍÓÚÑ]/.test(password);
    const hasLower = /[a-záéíóúñ]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return {
        valid: Boolean(minLength && hasUpper && hasLower && hasNumber),
        minLength,
        hasUpper,
        hasLower,
        hasNumber
    };
}

/**
 * Galería predefinida de imágenes para facilitar el registro de productos (RN-06)
 */
const PRODUCT_IMAGE_PRESETS = [
    { label: 'Detergente Multiusos', url: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=500&q=80' },
    { label: 'Café Molido Premium', url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=500&q=80' },
    { label: 'Aceite Vegetal Cocina', url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=500&q=80' },
    { label: 'Jabón Líquido Antibacterial', url: 'https://images.unsplash.com/photo-1584305574647-0cc949a2bb9f?auto=format&fit=crop&w=500&q=80' },
    { label: 'Arroz Blanco Seleccionado', url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=500&q=80' },
    { label: 'Set Limpieza Hogar', url: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=500&q=80' },
    { label: 'Galletas Integrales', url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=500&q=80' },
    { label: 'Toallas de Cocina', url: 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=500&q=80' }
];

/**
 * Categorías oficiales del negocio (RN-10, Cap. 22 Supuestos)
 */
const PRODUCT_CATEGORIES = [
    'Aseo del Hogar',
    'Alimentos y Despensa',
    'Bebidas y Lácteos',
    'Cuidado Personal',
    'Artículos de Cocina'
];

/**
 * Datos semilla (Estado inicial de Comercializadora ABC S.A.S.)
 */
function getInitialSeedData() {
    return {
        metadata: {
            projectCode: 'SW-GPP-001',
            version: '1.0',
            client: 'Comercializadora ABC S.A.S.',
            developer: 'SoftSolutions Colombia S.A.S.',
            lastReset: new Date().toISOString()
        },
        // Entidad Usuario (Cap. 19 Diccionario de Datos + RNF-02, RN-04, RN-21, RN-25)
        usuarios: [
            {
                id_usuario: 1,
                nombre: 'Laura',
                apellido: 'Gómez',
                correo: 'admin@comercializadoraabc.com',
                contraseña: hashPassword('Admin1234'),
                rol: 'Administrador Principal',
                estado: true, // Activo
                intentos_fallidos: 0,
                bloqueado_hasta: null,
                sesion_activa: false,
                ultimo_acceso: '2026-08-12 09:15:00'
            },
            {
                id_usuario: 2,
                nombre: 'Carlos',
                apellido: 'Rodríguez',
                correo: 'carlos.rodriguez@comercializadoraabc.com',
                contraseña: hashPassword('Carlos2026'),
                rol: 'Administrador Comercial',
                estado: true, // Activo
                intentos_fallidos: 0,
                bloqueado_hasta: null,
                sesion_activa: false,
                ultimo_acceso: '2026-08-11 16:40:22'
            },
            {
                id_usuario: 3,
                nombre: 'Andrés',
                apellido: 'Herrera',
                correo: 'andres.herrera@comercializadoraabc.com',
                contraseña: hashPassword('Andres2026'),
                rol: 'Supervisor de Operaciones',
                estado: false, // Inactivo (para probar RN-05)
                intentos_fallidos: 0,
                bloqueado_hasta: null,
                sesion_activa: false,
                ultimo_acceso: '2026-08-05 11:20:10'
            },
            {
                id_usuario: 4,
                nombre: 'María',
                apellido: 'Fernández',
                correo: 'maria.fernandez@comercializadoraabc.com',
                contraseña: hashPassword('Maria2026'),
                rol: 'Directora de Operaciones',
                estado: true,
                intentos_fallidos: 0,
                bloqueado_hasta: null,
                sesion_activa: false,
                ultimo_acceso: '2026-08-12 08:05:44'
            },
            {
                id_usuario: 5,
                nombre: 'Julián',
                apellido: 'Ortiz',
                correo: 'cliente1@elporvenir.co',
                contraseña: hashPassword('Cliente2026'),
                rol: 'Cliente',
                cliente_asociado: 'Supermercados El Porvenir S.A.S.',
                estado: true,
                intentos_fallidos: 0,
                bloqueado_hasta: null,
                sesion_activa: false,
                ultimo_acceso: null
            },
            {
                id_usuario: 6,
                nombre: 'Sandra',
                apellido: 'Mejía',
                correo: 'cliente2@distrivalle.com',
                contraseña: hashPassword('Cliente2026'),
                rol: 'Cliente',
                cliente_asociado: 'Distribuidora del Valle Ltda.',
                estado: true,
                intentos_fallidos: 0,
                bloqueado_hasta: null,
                sesion_activa: false,
                ultimo_acceso: null
            }
        ],
        // Clientes preexistentes en el sistema (Cap. 22 Supuestos del Proyecto)
        clientes: [
            { id_cliente: 101, nombre: 'Supermercados El Porvenir S.A.S.', nit: '900.412.589-1', ciudad: 'Bogotá', telefono: '3104567890', correo: 'compras@elporvenir.co' },
            { id_cliente: 102, nombre: 'Distribuidora del Valle Ltda.', nit: '890.315.221-4', ciudad: 'Cali', telefono: '3159876543', correo: 'pedidos@distrivalle.com' },
            { id_cliente: 103, nombre: 'Minimercado La Economía', nit: '901.102.334-8', ciudad: 'Medellín', telefono: '3001122334', correo: 'administracion@laeconomia.co' },
            { id_cliente: 104, nombre: 'Autoservicio San Martín', nit: '800.774.912-0', ciudad: 'Barranquilla', telefono: '3205544332', correo: 'logistica@autosanmartin.com' },
            { id_cliente: 105, nombre: 'Comercializadora Los Andes', nit: '900.885.119-6', ciudad: 'Bucaramanga', telefono: '3112233445', correo: 'contacto@losandes.com.co' }
        ],
        // Entidad Producto (Cap. 19: id_producto, nombre, descripción, precio <= 10000, imagen, estado, categoría)
        productos: [
            {
                id_producto: 1001,
                nombre: 'Detergente Líquido BioClean 1L',
                descripcion: 'Detergente concentrado biodegradable para ropa blanca y de color con aroma floral.',
                precio: 8500,
                imagen: 'https://images.unsplash.com/photo-1585421514738-01798e348b17?auto=format&fit=crop&w=500&q=80',
                estado: true,
                categoria: 'Aseo del Hogar'
            },
            {
                id_producto: 1002,
                nombre: 'Café Molido Tradición 500g',
                descripcion: 'Café 100% colombiano de tueste medio y molienda fina para cafetera o filtro.',
                precio: 9800,
                imagen: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=500&q=80',
                estado: true,
                categoria: 'Alimentos y Despensa'
            },
            {
                id_producto: 1003,
                nombre: 'Aceite Vegetal Puro Girasol 900ml',
                descripcion: 'Aceite vegetal libre de colesterol ideal para freír y preparar ensaladas.',
                precio: 9200,
                imagen: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=500&q=80',
                estado: true,
                categoria: 'Alimentos y Despensa'
            },
            {
                id_producto: 1004,
                nombre: 'Jabón Antibacterial Avena 500ml',
                descripcion: 'Jabón líquido para manos con extracto natural de avena y glicerina humectante.',
                precio: 6400,
                imagen: 'https://images.unsplash.com/photo-1584305574647-0cc949a2bb9f?auto=format&fit=crop&w=500&q=80',
                estado: true,
                categoria: 'Cuidado Personal'
            },
            {
                id_producto: 1005,
                nombre: 'Arroz Blanco Premium 2.5kg',
                descripcion: 'Arroz blanco seleccionado grano entero enriquecido con vitaminas.',
                precio: 7900,
                imagen: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=500&q=80',
                estado: true,
                categoria: 'Alimentos y Despensa'
            },
            {
                id_producto: 1006,
                nombre: 'Kit Esponjas y Paños Microfibra x4',
                descripcion: 'Paquete de paños ultra absorbentes y esponjas multiusos que no rayan.',
                precio: 5300,
                imagen: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=500&q=80',
                estado: true,
                categoria: 'Artículos de Cocina'
            },
            {
                id_producto: 1007,
                nombre: 'Galletas Integrales Miel y Avena x6',
                descripcion: 'Empaque familiar de galletas horneadas con fibra natural y miel pura.',
                precio: 4800,
                imagen: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=500&q=80',
                estado: false, // Producto inactivo de prueba (RF-12)
                categoria: 'Alimentos y Despensa'
            },
            {
                id_producto: 1008,
                nombre: 'Rollo Toallas de Cocina Triple Hoja',
                descripcion: 'Toallas de papel reutilizables de alta resistencia y máxima absorción (Sin pedidos asociados para probar RF-11).',
                precio: 4200,
                imagen: 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=500&q=80',
                estado: true,
                categoria: 'Artículos de Cocina'
            }
        ],
        // Módulo Medios de Pago (Cap. 12.6, RF-20, RF-21, RN-19, RN-20)
        medios_pago: [
            { id_medio: 1, codigo: 'Crédito', nombre: 'Tarjeta de Crédito', descripcion: 'Pagos con franquicia Visa, MasterCard o American Express.', activo: true },
            { id_medio: 2, codigo: 'Débito', nombre: 'Tarjeta Débito', descripcion: 'Débito bancario directo / PSE.', activo: true },
            { id_medio: 3, codigo: 'Efectivo', nombre: 'Pago en Efectivo', descripcion: 'Pago contraentrega o recaudo en punto autorizado.', activo: true }
        ],
        // Entidad Pedido (Cap. 19: id_pedido, fecha, cliente, estado, medio_pago + items detallados)
        pedidos: [
            {
                id_pedido: 5001,
                fecha: '2026-08-10',
                hora: '10:30:00',
                cliente: 'Supermercados El Porvenir S.A.S.',
                estado: 'Confirmado',
                medio_pago: 'Crédito',
                creado_por: 'Laura Gómez',
                items: [
                    { id_producto: 1001, nombre: 'Detergente Líquido BioClean 1L', precio: 8500, cantidad: 10 },
                    { id_producto: 1002, nombre: 'Café Molido Tradición 500g', precio: 9800, cantidad: 5 }
                ],
                total: 134000,
                observaciones: 'Entrega prioritaria en bodega norte.'
            },
            {
                id_pedido: 5002,
                fecha: '2026-08-11',
                hora: '14:20:00',
                cliente: 'Distribuidora del Valle Ltda.',
                estado: 'Pendiente',
                medio_pago: 'Débito',
                creado_por: 'Carlos Rodríguez',
                items: [
                    { id_producto: 1003, nombre: 'Aceite Vegetal Puro Girasol 900ml', precio: 9200, cantidad: 8 },
                    { id_producto: 1005, nombre: 'Arroz Blanco Premium 2.5kg', precio: 7900, cantidad: 12 }
                ],
                total: 168400,
                observaciones: 'Pendiente de confirmación telefónica con el cliente.'
            },
            {
                id_pedido: 5003,
                fecha: '2026-08-11',
                hora: '16:05:00',
                cliente: 'Minimercado La Economía',
                estado: 'Cancelado',
                medio_pago: 'Efectivo',
                creado_por: 'Carlos Rodríguez',
                items: [
                    { id_producto: 1004, nombre: 'Jabón Antibacterial Avena 500ml', precio: 6400, cantidad: 6 }
                ],
                total: 38400,
                observaciones: 'Cancelado a solicitud del cliente antes de confirmación.'
            },
            {
                id_pedido: 5004,
                fecha: '2026-08-12',
                hora: '09:45:00',
                cliente: 'Autoservicio San Martín',
                estado: 'Pendiente',
                medio_pago: 'Efectivo',
                creado_por: 'Laura Gómez',
                items: [
                    { id_producto: 1006, nombre: 'Kit Esponjas y Paños Microfibra x4', precio: 5300, cantidad: 15 }
                ],
                total: 79500,
                observaciones: 'Despacho programado para la tarde.'
            },
            {
                id_pedido: 5005,
                fecha: '2026-08-12',
                hora: '11:10:00',
                cliente: 'Comercializadora Los Andes',
                estado: 'Confirmado',
                medio_pago: 'Débito',
                creado_por: 'María Fernández',
                items: [
                    { id_producto: 1002, nombre: 'Café Molido Tradición 500g', precio: 9800, cantidad: 20 },
                    { id_producto: 1005, nombre: 'Arroz Blanco Premium 2.5kg', precio: 7900, cantidad: 10 }
                ],
                total: 275000,
                observaciones: 'Orden mayorista aprobada.'
            }
        ],
        // Entidad Historial (Cap. 12.5, Cap. 19, RNF-05, RNF-28, RN-16, RN-17, RN-18)
        historial: [
            {
                id_historial: 1,
                fecha: '2026-08-10',
                hora: '10:30:12',
                usuario: 'Laura Gómez',
                cliente: 'Supermercados El Porvenir S.A.S.',
                id_pedido: 5001,
                modulo: 'Pedidos',
                accion: 'Registro de Pedido #5001',
                estado: 'Pendiente',
                observacion: 'Creación inicial de orden por $134.000 con medio de pago Crédito.'
            },
            {
                id_historial: 2,
                fecha: '2026-08-10',
                hora: '11:05:40',
                usuario: 'Laura Gómez',
                cliente: 'Supermercados El Porvenir S.A.S.',
                id_pedido: 5001,
                modulo: 'Pedidos',
                accion: 'Confirmación de Pedido #5001',
                estado: 'Confirmado',
                observacion: 'Pedido verificado y cambiado a estado Confirmado (RN-13 aplicado).'
            },
            {
                id_historial: 3,
                fecha: '2026-08-11',
                hora: '14:20:05',
                usuario: 'Carlos Rodríguez',
                cliente: 'Distribuidora del Valle Ltda.',
                id_pedido: 5002,
                modulo: 'Pedidos',
                accion: 'Registro de Pedido #5002',
                estado: 'Pendiente',
                observacion: 'Pedido registrado con 2 líneas de producto por $168.400.'
            },
            {
                id_historial: 4,
                fecha: '2026-08-11',
                hora: '16:05:19',
                usuario: 'Carlos Rodríguez',
                cliente: 'Minimercado La Economía',
                id_pedido: 5003,
                modulo: 'Pedidos',
                accion: 'Registro de Pedido #5003',
                estado: 'Pendiente',
                observacion: 'Pedido inicial por $38.400 en Efectivo.'
            },
            {
                id_historial: 5,
                fecha: '2026-08-11',
                hora: '17:12:33',
                usuario: 'Carlos Rodríguez',
                cliente: 'Minimercado La Economía',
                id_pedido: 5003,
                modulo: 'Pedidos',
                accion: 'Cancelación de Pedido #5003',
                estado: 'Cancelado',
                observacion: 'El cliente solicitó cancelar antes de confirmación. Se conserva trazabilidad (RN-14).'
            },
            {
                id_historial: 6,
                fecha: '2026-08-12',
                hora: '08:30:00',
                usuario: 'María Fernández',
                cliente: 'N/A',
                id_pedido: null,
                modulo: 'Productos',
                accion: 'Actualización de Producto #1002',
                estado: 'Activo',
                observacion: 'Ajuste de precio de catálogo a $9.800 cumpliendo tope RN-07.'
            },
            {
                id_historial: 7,
                fecha: '2026-08-12',
                hora: '09:45:10',
                usuario: 'Laura Gómez',
                cliente: 'Autoservicio San Martín',
                id_pedido: 5004,
                modulo: 'Pedidos',
                accion: 'Registro de Pedido #5004',
                estado: 'Pendiente',
                observacion: 'Orden registrada por $79.500 con medio de pago Efectivo.'
            },
            {
                id_historial: 8,
                fecha: '2026-08-12',
                hora: '11:15:22',
                usuario: 'María Fernández',
                cliente: 'Comercializadora Los Andes',
                id_pedido: 5005,
                modulo: 'Pedidos',
                accion: 'Confirmación de Pedido #5005',
                estado: 'Confirmado',
                observacion: 'Pedido mayorista confirmado por $275.000.'
            }
        ],
        // Log de errores del sistema (RNF-18: Los errores deberán registrarse automáticamente en el log del sistema)
        logs_errores: [
            {
                id_log: 1,
                fecha: '2026-08-11 15:42:10',
                codigo: 'ERR-RN07',
                modulo: 'Productos',
                mensaje: 'Intento de registrar producto con precio ($14.500) superior al límite permitido de $10.000 (RN-07).',
                usuario: 'Carlos Rodríguez'
            },
            {
                id_log: 2,
                fecha: '2026-08-12 08:19:04',
                codigo: 'ERR-RN13',
                modulo: 'Pedidos',
                mensaje: 'Operación rechazada: Intento de eliminar el pedido confirmado #5001 (RN-13).',
                usuario: 'Laura Gómez'
            }
        ],
        // Solicitudes de recuperación de contraseña (RF-03)
        recuperaciones: []
    };
}

/**
 * Carga la base de datos desde LocalStorage o inicializa con la semilla
 */
function loadDB() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            const seed = getInitialSeedData();
            saveDB(seed);
            return seed;
        }
        return JSON.parse(raw);
    } catch (e) {
        console.error('Error leyendo LocalStorage, usando datos en memoria:', e);
        return getInitialSeedData();
    }
}

/**
 * Guarda la base de datos en LocalStorage
 */
function saveDB(db) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
        console.error('Error guardando en LocalStorage:', e);
    }
}

/**
 * Restaura la base de datos a los valores originales del caso de estudio
 */
function resetDatabaseToSeed() {
    const seed = getInitialSeedData();
    saveDB(seed);
    localStorage.removeItem(SESSION_KEY);
    return seed;
}

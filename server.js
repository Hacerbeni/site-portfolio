'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');
const express = require('express');

const scrypt = promisify(crypto.scrypt);
const ROOT = __dirname;
dotenv.config({ path: path.join(ROOT, '.env') });
const DEFAULT_DATABASE_PATH = path.join(ROOT, 'data', 'portfolio.sqlite');
const SESSION_COOKIE = 'portfolio_session';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const SESSION_DURATION_SECONDS = SESSION_DURATION_MS / 1000;

const INITIAL_PROFILE = {
    fullName: 'Bénéwendé Ouédraogo',
    headline: 'Réseaux émergents, IoT et intelligence embarquée',
    intro: "Titulaire d'un Master en Réseaux émergents, IoT et Intelligence embarquée, après une formation en électronique et informatique industrielle. Je m'intéresse aux réseaux, à l'Internet des Objets, au développement et à l'intelligence artificielle.",
    biography: "Titulaire d'un Master en Réseaux émergents, IoT et Intelligence embarquée, j'ai auparavant obtenu une Licence en électronique et informatique industrielle.\n\nMon parcours m'a permis de travailler sur des projets liés à l'électronique, aux réseaux, à l'Internet des Objets, à la programmation et à l'intelligence artificielle.\n\nJe développe également mes compétences en développement à travers ma formation à WISE Institute et j'ai obtenu un certificat en LLM avec Force N.",
    education: 'Master en Réseaux émergents, IoT et Intelligence embarquée'
};

const INITIAL_SKILLS = [
    { category: 'Développement web', name: 'HTML, CSS et JavaScript' },
    { category: 'Développement web', name: 'Python' },
    { category: 'IA et LLM', name: 'Machine Learning et Deep Learning' },
    { category: 'IA et LLM', name: 'Computer Vision, TensorFlow et ResNet' },
    { category: 'IoT et réseaux', name: 'Internet des Objets et réseaux' },
    { category: 'IoT et réseaux', name: 'Arduino, Edge Computing et Fog Computing' }
];

const INITIAL_PROJECTS = [
    {
        title: 'Détection des attaques dans l’IoT',
        category: 'Recherche · Intelligence artificielle',
        description: 'Travail de recherche de Master consacré à la détection des attaques de type DoS et DDoS dans les environnements IoT en utilisant ResNet.',
        year: 2025
    },
    {
        title: 'Système de contrôle à distance avec Arduino',
        category: 'Électronique · IoT',
        description: 'Conception d’un système de contrôle à distance basé sur Arduino, dans le cadre d’un projet de Licence.',
        year: 2023
    },
    {
        title: 'Système de présence RFID',
        category: 'Électronique · IoT',
        description: 'Réalisation d’un système de présence autour d’un Arduino Uno WiFi Rev2, d’un lecteur RFID MFRC522, de LED et d’un buzzer.',
        year: 2023
    },
    {
        title: 'Projets IoT avec Arduino',
        category: 'IoT · Prototypage',
        description: 'Projets de prototypage utilisant des capteurs pour détecter la fumée, la lumière, le mouvement et la distance.',
        year: 2022
    },
    {
        title: 'Projets avec Flutter et Node.js',
        category: 'Développement',
        description: 'Découverte du développement mobile et serveur à travers des projets réalisés au cours de mon parcours.',
        year: 2025
    }
];

function initializeDatabase(databasePath) {
    if (databasePath !== ':memory:') {
        fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }

    const db = new Database(databasePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');

    db.exec(`
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            full_name TEXT NOT NULL,
            headline TEXT NOT NULL,
            intro TEXT NOT NULL,
            biography TEXT NOT NULL,
            education TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS skills (
            id INTEGER PRIMARY KEY,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            category TEXT NOT NULL,
            description TEXT NOT NULL,
            year INTEGER NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const seedDatabase = db.transaction(() => {
        const seeded = db.prepare(
            "SELECT value FROM app_meta WHERE key = 'initial_content_v1'"
        ).get();
        if (seeded) return;

        db.prepare(`
            INSERT INTO profile (id, full_name, headline, intro, biography, education)
            VALUES (1, @fullName, @headline, @intro, @biography, @education)
            ON CONFLICT(id) DO NOTHING
        `).run(INITIAL_PROFILE);

        const insertSkill = db.prepare(
            'INSERT INTO skills (category, name, sort_order) VALUES (?, ?, ?)'
        );
        INITIAL_SKILLS.forEach((skill, index) => {
            insertSkill.run(skill.category, skill.name, index);
        });

        const insertProject = db.prepare(`
            INSERT INTO projects (title, category, description, year, sort_order)
            VALUES (@title, @category, @description, @year, @sortOrder)
        `);
        INITIAL_PROJECTS.forEach((project, index) => {
            insertProject.run({ ...project, sortOrder: INITIAL_PROJECTS.length - index });
        });

        db.prepare(
            "INSERT INTO app_meta (key, value) VALUES ('initial_content_v1', 'done')"
        ).run();
    });
    seedDatabase();
    return db;
}

function sameOriginRequest(req, publicOrigin) {
    const origin = req.get('origin');
    const host = req.get('host');
    if (!origin || !host) return false;

    try {
        const expectedOrigin = publicOrigin || `${req.protocol}://${host}`;
        const requestOrigin = new URL(origin);
        const parsedExpectedOrigin = new URL(expectedOrigin);
        return origin === requestOrigin.origin && requestOrigin.origin === parsedExpectedOrigin.origin;
    } catch {
        return false;
    }
}

function createRateLimiter({ limit, windowMs }) {
    const requests = new Map();

    return (req, res, next) => {
        const key = req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        let entry = requests.get(key);

        if (!entry || now >= entry.resetAt) {
            entry = { count: 0, resetAt: now + windowMs };
            requests.set(key, entry);
        }

        if (entry.count >= limit) {
            res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
            return res.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });
        }

        entry.count += 1;
        if (requests.size > 10000) {
            for (const [address, item] of requests) {
                if (now >= item.resetAt) requests.delete(address);
            }
        }

        return next();
    };
}

function requiredText(value, label, maxLength, { minLength = 1, allowNewlines = false } = {}) {
    if (typeof value !== 'string') {
        return { error: `${label} est obligatoire.` };
    }

    const normalized = value.trim();
    const hasDisallowedControl = allowNewlines
        ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)
        : /[\u0000-\u001F\u007F]/.test(normalized);

    if (normalized.length < minLength || normalized.length > maxLength || hasDisallowedControl) {
        return { error: `${label} doit contenir entre ${minLength} et ${maxLength} caractères valides.` };
    }

    return { value: normalized };
}

function validateProfile(body) {
    const fields = [
        ['fullName', 'Nom', 100, false],
        ['headline', 'Titre', 160, false],
        ['intro', 'Présentation courte', 800, true],
        ['biography', 'Biographie', 3000, true],
        ['education', 'Formation', 240, false]
    ];
    const result = {};

    for (const [key, label, maxLength, allowNewlines] of fields) {
        const field = requiredText(body[key], label, maxLength, { allowNewlines });
        if (field.error) return { error: field.error };
        result[key] = field.value;
    }
    return { value: result };
}

function validateProject(body) {
    const result = {};
    for (const [key, label, maxLength, allowNewlines] of [
        ['title', 'Titre', 120, false],
        ['category', 'Catégorie', 80, false],
        ['description', 'Description', 1600, true]
    ]) {
        const field = requiredText(body[key], label, maxLength, { allowNewlines });
        if (field.error) return { error: field.error };
        result[key] = field.value;
    }

    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return { error: 'L’année doit être comprise entre 1900 et 2100.' };
    }
    result.year = year;
    return { value: result };
}

async function createApplication({
    databasePath = process.env.DATABASE_PATH || DEFAULT_DATABASE_PATH,
    adminPassword = process.env.ADMIN_PASSWORD,
    production = process.env.NODE_ENV === 'production',
    publicOrigin = process.env.PUBLIC_ORIGIN
} = {}) {
    const db = initializeDatabase(databasePath);
    let passwordSalt = null;
    let passwordHash = null;

    if (publicOrigin) {
        let parsedOrigin;
        try {
            parsedOrigin = new URL(publicOrigin);
        } catch {
            db.close();
            throw new Error('PUBLIC_ORIGIN doit être une origine HTTP ou HTTPS valide.');
        }
        if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== publicOrigin) {
            db.close();
            throw new Error('PUBLIC_ORIGIN doit contenir uniquement le protocole et le nom de domaine.');
        }
    }

    if (adminPassword) {
        if (Buffer.byteLength(adminPassword, 'utf8') < 12) {
            db.close();
            throw new Error('ADMIN_PASSWORD doit contenir au moins 12 octets.');
        }
        passwordSalt = crypto.randomBytes(16);
        passwordHash = await scrypt(adminPassword, passwordSalt, 64, { maxmem: 64 * 1024 * 1024 });
    }

    const app = express();
    const sessions = new Map();
    const secureCookie = production ? '; Secure' : '';
    const loginLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
    const messageLimiter = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });

    app.disable('x-powered-by');
    app.use((req, res, next) => {
        res.set({
            'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'",
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
        });
        if (production && publicOrigin && new URL(publicOrigin).protocol === 'https:') {
            res.set('Strict-Transport-Security', 'max-age=31536000');
        }

        if (req.path.startsWith('/api/')) {
            res.set('Cache-Control', 'no-store');
        }
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !sameOriginRequest(req, publicOrigin)) {
            return res.status(403).json({ error: 'Origine de la requête refusée.' });
        }
        return next();
    });
    app.use(express.json({ limit: '16kb', strict: true }));

    function currentSession(req) {
        const cookie = (req.get('cookie') || '')
            .split(';')
            .map((part) => part.trim())
            .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
        const token = cookie ? cookie.slice(SESSION_COOKIE.length + 1) : '';
        if (!/^[a-f0-9]{64}$/.test(token)) return null;

        const session = sessions.get(token);
        if (!session) return null;
        if (Date.now() >= session.expiresAt) {
            sessions.delete(token);
            return null;
        }
        return { token, ...session };
    }

    function requireAdmin(req, res, next) {
        if (!currentSession(req)) {
            return res.status(401).json({ error: 'Authentification requise.' });
        }
        return next();
    }

    const publicFiles = new Map([
        ['/', 'index.html'],
        ['/admin.html', 'admin.html'],
        ['/styles.css', 'styles.css'],
        ['/script.js', 'script.js'],
        ['/admin.js', 'admin.js'],
        ['/20230219_090401~2.jpg', '20230219_090401~2.jpg'],
        ['/40011569-green-grape-isolated-on-white-background.jpg', '40011569-green-grape-isolated-on-white-background.jpg']
    ]);

    for (const [route, filename] of publicFiles) {
        app.get(route, (req, res, next) => {
            res.sendFile(path.join(ROOT, filename), {
                headers: { 'Cache-Control': 'no-cache' }
            }, (error) => {
                if (error) next(error);
            });
        });
    }

    app.get('/api/portfolio', (req, res) => {
        const profile = db.prepare(`
            SELECT full_name AS fullName, headline, intro, biography, education
            FROM profile WHERE id = 1
        `).get();
        const skills = db.prepare(`
            SELECT category, name
            FROM skills
            ORDER BY sort_order, id
        `).all();
        const projects = db.prepare(`
            SELECT id, title, category, description, year
            FROM projects
            ORDER BY sort_order DESC, id DESC
        `).all();

        const groupedSkills = skills.reduce((groups, skill) => {
            if (!groups[skill.category]) groups[skill.category] = [];
            groups[skill.category].push(skill.name);
            return groups;
        }, {});

        return res.json({ profile, skills: groupedSkills, projects });
    });

    app.post('/api/messages', messageLimiter, (req, res) => {
        const name = requiredText(req.body?.name, 'Le nom', 100);
        const email = requiredText(req.body?.email, 'L’adresse e-mail', 254);
        const message = requiredText(req.body?.message, 'Le message', 3000, {
            minLength: 10,
            allowNewlines: true
        });
        if (name.error || email.error || message.error) {
            return res.status(400).json({ error: name.error || email.error || message.error });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
            return res.status(400).json({ error: 'L’adresse e-mail est invalide.' });
        }

        const result = db.prepare(`
            INSERT INTO messages (name, email, message)
            VALUES (@name, @email, @message)
        `).run({ name: name.value, email: email.value, message: message.value });
        return res.status(201).json({ id: Number(result.lastInsertRowid) });
    });

    app.get('/api/admin/session', (req, res) => {
        return res.json({ authenticated: Boolean(currentSession(req)) });
    });

    app.post('/api/admin/session', loginLimiter, async (req, res, next) => {
        if (!passwordHash || !passwordSalt) {
            return res.status(503).json({ error: 'L’administration n’est pas configurée.' });
        }

        const password = req.body?.password;
        if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 1024) {
            return res.status(400).json({ error: 'Identifiants invalides.' });
        }

        try {
            const candidateHash = await scrypt(password, passwordSalt, passwordHash.length, {
                maxmem: 64 * 1024 * 1024
            });
            if (!crypto.timingSafeEqual(candidateHash, passwordHash)) {
                return res.status(401).json({ error: 'Mot de passe incorrect.' });
            }

            const token = crypto.randomBytes(32).toString('hex');
            sessions.set(token, { expiresAt: Date.now() + SESSION_DURATION_MS });
            res.set('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION_SECONDS}${secureCookie}`);
            return res.json({ authenticated: true });
        } catch (error) {
            return next(error);
        }
    });

    app.delete('/api/admin/session', (req, res) => {
        const session = currentSession(req);
        if (session) sessions.delete(session.token);
        res.set('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`);
        return res.status(204).end();
    });

    const admin = express.Router();
    admin.use(requireAdmin);

    admin.put('/profile', (req, res) => {
        const profile = validateProfile(req.body || {});
        if (profile.error) return res.status(400).json({ error: profile.error });

        db.prepare(`
            UPDATE profile
            SET full_name = @fullName, headline = @headline, intro = @intro,
                biography = @biography, education = @education
            WHERE id = 1
        `).run(profile.value);
        return res.json({ profile: profile.value });
    });

    admin.get('/projects', (req, res) => {
        const projects = db.prepare(`
            SELECT id, title, category, description, year
            FROM projects ORDER BY sort_order DESC, id DESC
        `).all();
        return res.json({ projects });
    });

    admin.post('/projects', (req, res) => {
        const project = validateProject(req.body || {});
        if (project.error) return res.status(400).json({ error: project.error });
        const sortOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS value FROM projects').get().value;
        const result = db.prepare(`
            INSERT INTO projects (title, category, description, year, sort_order)
            VALUES (@title, @category, @description, @year, @sortOrder)
        `).run({ ...project.value, sortOrder });
        return res.status(201).json({
            project: { id: Number(result.lastInsertRowid), ...project.value }
        });
    });

    admin.put('/projects/:id', (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) {
            return res.status(400).json({ error: 'Identifiant de projet invalide.' });
        }
        const project = validateProject(req.body || {});
        if (project.error) return res.status(400).json({ error: project.error });
        const result = db.prepare(`
            UPDATE projects
            SET title = @title, category = @category, description = @description, year = @year
            WHERE id = @id
        `).run({ ...project.value, id });
        if (result.changes === 0) return res.status(404).json({ error: 'Projet introuvable.' });
        return res.json({ project: { id, ...project.value } });
    });

    admin.delete('/projects/:id', (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) {
            return res.status(400).json({ error: 'Identifiant de projet invalide.' });
        }
        const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        if (result.changes === 0) return res.status(404).json({ error: 'Projet introuvable.' });
        return res.status(204).end();
    });

    admin.get('/messages', (req, res) => {
        const messages = db.prepare(`
            SELECT id, name, email, message, is_read AS isRead, created_at AS createdAt
            FROM messages
            ORDER BY is_read ASC, created_at DESC, id DESC
        `).all();
        return res.json({ messages });
    });

    admin.patch('/messages/:id', (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.isRead !== 'boolean') {
            return res.status(400).json({ error: 'Modification du message invalide.' });
        }
        const result = db.prepare('UPDATE messages SET is_read = ? WHERE id = ?')
            .run(req.body.isRead ? 1 : 0, id);
        if (result.changes === 0) return res.status(404).json({ error: 'Message introuvable.' });
        return res.json({ id, isRead: req.body.isRead });
    });

    admin.delete('/messages/:id', (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) {
            return res.status(400).json({ error: 'Identifiant de message invalide.' });
        }
        const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
        if (result.changes === 0) return res.status(404).json({ error: 'Message introuvable.' });
        return res.status(204).end();
    });

    app.use('/api/admin', admin);
    app.use('/api', (req, res) => res.status(404).json({ error: 'Route API introuvable.' }));
    app.use((req, res) => res.status(404).type('text').send('Page introuvable.'));
    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);

        if (error.type === 'entity.too.large') {
            return res.status(413).json({ error: 'La requête est trop volumineuse.' });
        }
        if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
            return res.status(400).json({ error: 'Le corps JSON est invalide.' });
        }

        console.error('Erreur interne lors du traitement de la requête:', error.message);
        return res.status(500).json({ error: 'Une erreur interne est survenue.' });
    });

    return {
        app,
        db,
        close() {
            sessions.clear();
            db.close();
        }
    };
}

if (require.main === module) {
    createApplication().then(({ app, close }) => {
        const port = Number(process.env.PORT || 3000);
        const host = process.env.HOST || '127.0.0.1';
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('PORT doit être un nombre compris entre 1 et 65535.');
        }

        const server = app.listen(port, host, () => {
            console.log(`Portfolio disponible sur http://${host}:${port}`);
        });
        const shutdown = () => {
            server.close(() => {
                close();
                process.exit(0);
            });
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }).catch((error) => {
        console.error('Impossible de démarrer le serveur:', error.message);
        process.exitCode = 1;
    });
}

module.exports = { createApplication };

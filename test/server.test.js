'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createApplication } = require('../server');

const ADMIN_PASSWORD = 'correct-horse-battery-2026';
let application;
let server;
let baseUrl;

before(async () => {
    application = await createApplication({
        databasePath: ':memory:',
        adminPassword: ADMIN_PASSWORD,
        production: false
    });
    server = application.app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
    if (application) application.close();
});

async function request(route, { method = 'GET', body, cookie, origin = baseUrl } = {}) {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;

    return fetch(`${baseUrl}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

test('public portfolio, contact form, admin access and data management', async () => {
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(home.headers.get('x-powered-by'), null);
    assert.equal((await request('/package.json')).status, 404);

    const portfolioResponse = await request('/api/portfolio');
    const portfolio = await portfolioResponse.json();
    assert.equal(portfolioResponse.status, 200);
    assert.equal(portfolio.profile.fullName, 'Bénéwendé Ouédraogo');
    assert.ok(portfolio.projects.length >= 1);
    assert.ok(portfolio.skills['Développement web']);
    assert.deepEqual(await (await request('/api/admin/session')).json(), { authenticated: false });

    const blockedMessage = await request('/api/messages', {
        method: 'POST',
        origin: 'https://other.example',
        body: { name: 'Visiteur', email: 'visitor@example.com', message: 'Bonjour, ceci est un message.' }
    });
    assert.equal(blockedMessage.status, 403);

    const invalidMessage = await request('/api/messages', {
        method: 'POST',
        body: { name: 'Visiteur', email: 'not-an-email', message: 'Message de test assez long.' }
    });
    assert.equal(invalidMessage.status, 400);

    const submittedMessage = await request('/api/messages', {
        method: 'POST',
        body: {
            name: '<img src=x onerror=alert(1)>',
            email: 'visitor@example.com',
            message: 'Bonjour, ceci est un message de test.'
        }
    });
    assert.equal(submittedMessage.status, 201);

    const unauthorized = await request('/api/admin/projects');
    assert.equal(unauthorized.status, 401);

    const wrongPassword = await request('/api/admin/session', {
        method: 'POST',
        body: { password: 'incorrect-password' }
    });
    assert.equal(wrongPassword.status, 401);

    const login = await request('/api/admin/session', {
        method: 'POST',
        body: { password: ADMIN_PASSWORD }
    });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];

    const messagesResponse = await request('/api/admin/messages', { cookie });
    const messagesData = await messagesResponse.json();
    assert.equal(messagesResponse.status, 200);
    assert.equal(messagesData.messages.length, 1);
    assert.equal(messagesData.messages[0].name, '<img src=x onerror=alert(1)>');

    const created = await request('/api/admin/projects', {
        method: 'POST',
        cookie,
        body: {
            title: "Test' OR 1=1 --",
            category: 'Sécurité',
            year: 2026,
            description: 'Un texte qui reste une simple donnée.'
        }
    });
    assert.equal(created.status, 201);
    const project = (await created.json()).project;
    assert.equal(project.title, "Test' OR 1=1 --");

    const updated = await request(`/api/admin/projects/${project.id}`, {
        method: 'PUT',
        cookie,
        body: { ...project, title: 'Projet mis à jour' }
    });
    assert.equal(updated.status, 200);

    const invalidUpdate = await request(`/api/admin/projects/${project.id}`, {
        method: 'PUT',
        cookie,
        body: { ...project, year: 9999 }
    });
    assert.equal(invalidUpdate.status, 400);

    const publicAfterUpdate = await (await request('/api/portfolio')).json();
    assert.ok(publicAfterUpdate.projects.some((item) => item.title === 'Projet mis à jour'));

    const changedProfile = await request('/api/admin/profile', {
        method: 'PUT',
        cookie,
        body: {
            fullName: 'Nom modifié',
            headline: 'Un nouveau titre',
            intro: 'Une présentation mise à jour.',
            biography: 'Un premier paragraphe.\n\nUn second paragraphe.',
            education: 'Formation mise à jour'
        }
    });
    assert.equal(changedProfile.status, 200);
    assert.equal((await (await request('/api/portfolio')).json()).profile.fullName, 'Nom modifié');

    const messageId = messagesData.messages[0].id;
    const markedRead = await request(`/api/admin/messages/${messageId}`, {
        method: 'PATCH',
        cookie,
        body: { isRead: true }
    });
    assert.equal(markedRead.status, 200);

    assert.equal((await request(`/api/admin/projects/${project.id}`, { method: 'DELETE', cookie })).status, 204);
    assert.equal((await request(`/api/admin/messages/${messageId}`, { method: 'DELETE', cookie })).status, 204);

    assert.equal((await request('/api/admin/session', { method: 'DELETE', cookie })).status, 204);
    assert.equal((await request('/api/admin/projects', { cookie })).status, 401);
});

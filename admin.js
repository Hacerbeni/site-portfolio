'use strict';

const loginPanel = document.querySelector('[data-login-panel]');
const loginForm = document.querySelector('[data-login-form]');
const loginStatus = document.querySelector('[data-login-status]');
const dashboard = document.querySelector('[data-dashboard]');
const dashboardStatus = document.querySelector('[data-dashboard-status]');
const profileForm = document.querySelector('[data-profile-form]');
const projectForm = document.querySelector('[data-project-form]');
const projectList = document.querySelector('[data-admin-projects]');
const messageList = document.querySelector('[data-admin-messages]');

async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        }
    });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
}

function showDashboard(visible) {
    loginPanel.hidden = visible;
    dashboard.hidden = !visible;
}

function setFormValue(form, field, value) {
    form.elements.namedItem(field).value = value;
}

async function loadProfile() {
    const { profile } = await api('/api/portfolio');
    Object.entries(profile).forEach(([key, value]) => setFormValue(profileForm, key, value));
}

function renderProjects(projects) {
    projectList.replaceChildren();
    if (projects.length === 0) {
        projectList.append(element('p', 'empty-state', 'Aucun projet pour le moment.'));
        return;
    }

    projects.forEach((project) => {
        const card = element('article', 'admin-list-card');
        const content = element('div', 'admin-list-content');
        content.append(element('p', 'project-category', `${project.category} · ${project.year}`));
        content.append(element('h3', '', project.title));
        content.append(element('p', '', project.description));

        const actions = element('div', 'admin-item-actions');
        const edit = element('button', 'button button-secondary', 'Modifier');
        edit.type = 'button';
        edit.addEventListener('click', () => {
            setFormValue(projectForm, 'id', String(project.id));
            setFormValue(projectForm, 'title', project.title);
            setFormValue(projectForm, 'category', project.category);
            setFormValue(projectForm, 'year', String(project.year));
            setFormValue(projectForm, 'description', project.description);
            projectForm.querySelector('[data-project-form-title]').textContent = 'Modifier un projet';
            projectForm.querySelector('[data-project-submit]').textContent = 'Enregistrer les modifications';
            projectForm.querySelector('[data-project-cancel]').hidden = false;
            projectForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        const remove = element('button', 'button button-danger', 'Supprimer');
        remove.type = 'button';
        remove.addEventListener('click', async () => {
            if (!window.confirm(`Supprimer le projet « ${project.title} » ?`)) return;
            try {
                await api(`/api/admin/projects/${project.id}`, { method: 'DELETE' });
                dashboardStatus.textContent = 'Projet supprimé.';
                await loadProjects();
            } catch (error) {
                dashboardStatus.textContent = error.message;
            }
        });
        actions.append(edit, remove);
        card.append(content, actions);
        projectList.append(card);
    });
}

async function loadProjects() {
    const { projects } = await api('/api/admin/projects');
    renderProjects(projects);
}

function renderMessages(messages) {
    messageList.replaceChildren();
    if (messages.length === 0) {
        messageList.append(element('p', 'empty-state', 'Aucun message reçu pour le moment.'));
        return;
    }

    messages.forEach((message) => {
        const card = element('article', `admin-list-card message-card${message.isRead ? '' : ' is-unread'}`);
        const content = element('div', 'admin-list-content');
        const date = new Date(`${message.createdAt.replace(' ', 'T')}Z`);
        content.append(element('p', 'project-category', `${message.isRead ? 'Lu' : 'Nouveau'} · ${date.toLocaleString('fr-FR')}`));
        content.append(element('h3', '', message.name));

        const email = element('a', 'message-email', message.email);
        email.href = `mailto:${encodeURIComponent(message.email)}`;
        content.append(email);
        content.append(element('p', 'message-body', message.message));

        const actions = element('div', 'admin-item-actions');
        const readButton = element('button', 'button button-secondary', message.isRead ? 'Marquer non lu' : 'Marquer comme lu');
        readButton.type = 'button';
        readButton.addEventListener('click', async () => {
            try {
                await api(`/api/admin/messages/${message.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ isRead: !message.isRead })
                });
                await loadMessages();
            } catch (error) {
                dashboardStatus.textContent = error.message;
            }
        });

        const remove = element('button', 'button button-danger', 'Supprimer');
        remove.type = 'button';
        remove.addEventListener('click', async () => {
            if (!window.confirm(`Supprimer le message de ${message.name} ?`)) return;
            try {
                await api(`/api/admin/messages/${message.id}`, { method: 'DELETE' });
                dashboardStatus.textContent = 'Message supprimé.';
                await loadMessages();
            } catch (error) {
                dashboardStatus.textContent = error.message;
            }
        });
        actions.append(readButton, remove);
        card.append(content, actions);
        messageList.append(card);
    });
}

async function loadMessages() {
    const { messages } = await api('/api/admin/messages');
    renderMessages(messages);
}

async function showAuthenticatedArea() {
    showDashboard(true);
    try {
        await Promise.all([loadProfile(), loadProjects(), loadMessages()]);
        dashboardStatus.textContent = '';
    } catch (error) {
        dashboardStatus.textContent = error.message;
        if (error.message === 'Authentification requise.') showDashboard(false);
    }
}

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    loginStatus.textContent = 'Vérification en cours…';
    loginStatus.classList.remove('is-error');

    try {
        await api('/api/admin/session', {
            method: 'POST',
            body: JSON.stringify(formValues(loginForm))
        });
        loginForm.reset();
        await showAuthenticatedArea();
    } catch (error) {
        loginStatus.textContent = error.message;
        loginStatus.classList.add('is-error');
    } finally {
        submitButton.disabled = false;
    }
});

profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
        await api('/api/admin/profile', {
            method: 'PUT',
            body: JSON.stringify(formValues(profileForm))
        });
        dashboardStatus.textContent = 'Profil enregistré.';
    } catch (error) {
        dashboardStatus.textContent = error.message;
    }
});

function resetProjectForm() {
    projectForm.reset();
    setFormValue(projectForm, 'id', '');
    projectForm.querySelector('[data-project-form-title]').textContent = 'Ajouter un projet';
    projectForm.querySelector('[data-project-submit]').textContent = 'Ajouter le projet';
    projectForm.querySelector('[data-project-cancel]').hidden = true;
}

projectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = formValues(projectForm);
    const id = values.id;
    delete values.id;
    values.year = Number(values.year);

    try {
        await api(id ? `/api/admin/projects/${encodeURIComponent(id)}` : '/api/admin/projects', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(values)
        });
        dashboardStatus.textContent = id ? 'Projet modifié.' : 'Projet ajouté.';
        resetProjectForm();
        await loadProjects();
    } catch (error) {
        dashboardStatus.textContent = error.message;
    }
});

projectForm.querySelector('[data-project-cancel]').addEventListener('click', resetProjectForm);

document.querySelector('[data-logout]').addEventListener('click', async () => {
    try {
        await api('/api/admin/session', { method: 'DELETE' });
        showDashboard(false);
        loginStatus.textContent = 'Vous êtes déconnecté.';
        loginStatus.classList.remove('is-error');
    } catch (error) {
        dashboardStatus.textContent = error.message;
    }
});

api('/api/admin/session')
    .then((session) => {
        if (session.authenticated) return showAuthenticatedArea();
        return showDashboard(false);
    })
    .catch((error) => {
        showDashboard(false);
        loginStatus.textContent = error.message || 'Impossible de vérifier la session.';
        loginStatus.classList.add('is-error');
    });

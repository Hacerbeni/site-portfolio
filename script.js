'use strict';

const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.navigation');
const skillsContainer = document.querySelector('[data-skills]');
const projectsContainer = document.querySelector('[data-projects]');
const contactForm = document.querySelector('[data-contact-form]');
const contactStatus = document.querySelector('[data-contact-status]');

function setText(selector, value) {
    document.querySelectorAll(`[data-profile="${selector}"]`).forEach((element) => {
        element.textContent = value;
    });
}

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

async function requestJson(url, options) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: 'application/json',
            ...(options && options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options && options.headers ? options.headers : {})
        }
    });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.error || 'Une erreur est survenue.');
    return data;
}

function renderBiography(biography) {
    const container = document.querySelector('[data-profile="biography"]');
    container.replaceChildren();
    biography.split(/\n{2,}/).filter(Boolean).forEach((paragraph) => {
        container.append(createElement('p', '', paragraph));
    });
}

function renderSkills(skills) {
    skillsContainer.replaceChildren();
    const groups = Object.entries(skills);
    if (groups.length === 0) {
        skillsContainer.append(createElement('p', 'loading-message', 'Les compétences seront bientôt disponibles.'));
        return;
    }

    groups.forEach(([category, items], index) => {
        const card = createElement('article', 'skill-card');
        card.append(createElement('span', 'card-index', String(index + 1).padStart(2, '0')));
        card.append(createElement('h3', '', category));
        const list = createElement('ul', 'skill-list');
        items.forEach((item) => list.append(createElement('li', '', item)));
        card.append(list);
        skillsContainer.append(card);
    });
}

function renderProjects(projects) {
    projectsContainer.replaceChildren();
    if (projects.length === 0) {
        projectsContainer.append(createElement('p', 'loading-message', 'Aucun projet n’est publié pour le moment.'));
        return;
    }

    projects.forEach((project, index) => {
        const card = createElement('article', 'project-card');
        const top = createElement('div', 'project-topline');
        top.append(createElement('span', 'project-number', String(index + 1).padStart(2, '0')));
        top.append(createElement('span', 'project-year', String(project.year)));
        card.append(top);
        card.append(createElement('p', 'project-category', project.category));
        card.append(createElement('h3', '', project.title));
        card.append(createElement('p', 'project-description', project.description));
        card.append(createElement('span', 'project-arrow', '↗'));
        projectsContainer.append(card);
    });
}

function closeMobileMenu() {
    menuToggle.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('is-open');
    menuToggle.querySelector('[aria-hidden="true"]').textContent = '☰';
    menuToggle.querySelector('.visually-hidden').textContent = 'Ouvrir le menu';
}

async function loadPortfolio() {
    try {
        const data = await requestJson('/api/portfolio');
        setText('fullName', data.profile.fullName);
        setText('headline', data.profile.headline);
        setText('intro', data.profile.intro);
        setText('education', data.profile.education);
        document.title = `Portfolio — ${data.profile.fullName}`;
        renderBiography(data.profile.biography);
        renderSkills(data.skills);
        renderProjects(data.projects);
    } catch {
        skillsContainer.replaceChildren(createElement('p', 'loading-message', 'Les compétences sont momentanément indisponibles.'));
        projectsContainer.replaceChildren(createElement('p', 'loading-message', 'Les projets sont momentanément indisponibles.'));
        contactStatus.textContent = 'Le portfolio est momentanément indisponible. Réessayez plus tard.';
    }
}

if (menuToggle && navigation) {
    menuToggle.addEventListener('click', () => {
        const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
        menuToggle.setAttribute('aria-expanded', String(!expanded));
        navigation.classList.toggle('is-open', !expanded);
        menuToggle.querySelector('[aria-hidden="true"]').textContent = expanded ? '☰' : '✕';
        menuToggle.querySelector('.visually-hidden').textContent = expanded ? 'Ouvrir le menu' : 'Fermer le menu';
    });

    navigation.addEventListener('click', (event) => {
        if (event.target.closest('a')) {
            closeMobileMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
            closeMobileMenu();
            menuToggle.focus();
        }
    });

    document.addEventListener('click', (event) => {
        const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
        if (isOpen && !navigation.contains(event.target) && !menuToggle.contains(event.target)) {
            closeMobileMenu();
        }
    });
}

contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(contactForm).entries());

    submitButton.disabled = true;
    contactStatus.textContent = 'Envoi en cours…';
    contactStatus.classList.remove('is-error');

    try {
        await requestJson('/api/messages', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        contactForm.reset();
        contactStatus.textContent = 'Merci, votre message a bien été envoyé.';
    } catch (error) {
        contactStatus.textContent = error.message || 'Impossible d’envoyer le message. Réessayez plus tard.';
        contactStatus.classList.add('is-error');
    } finally {
        submitButton.disabled = false;
    }
});

document.querySelector('[data-year]').textContent = String(new Date().getFullYear());
loadPortfolio();

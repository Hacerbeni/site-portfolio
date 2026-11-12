# Portfolio

Portfolio en HTML, CSS et JavaScript avec API Express et base de données SQLite (`better-sqlite3`). Les informations du profil, les compétences, les projets et les messages sont servis ou enregistrés par l’API ; le contenu initial est ajouté une seule fois à la base au premier démarrage.

## Démarrer en local

Prérequis : Node.js 20 ou plus récent.

```powershell
npm install
Copy-Item .env.example .env
# Remplacez CHANGE_ME par un mot de passe unique d’au moins 12 caractères dans .env.
npm start
```

Ouvrir ensuite `http://127.0.0.1:3000`. L’espace de gestion se trouve à `/admin.html`. Le serveur écoute uniquement sur l’interface locale par défaut. Les données sont enregistrées dans `data/portfolio.sqlite` et ne sont pas ajoutées à Git.

Le serveur lit le secret du fichier `.env` local ou de la variable d’environnement `ADMIN_PASSWORD`. `.env` est exclu de Git. Sans secret configuré, l’API publique reste disponible, mais la connexion à l’administration est désactivée. N’ajoutez jamais `.env` au dépôt.

## Administration

Depuis `/admin.html`, le responsable peut modifier le profil, ajouter/modifier/supprimer des projets, et consulter, marquer comme lus ou supprimer les messages reçus. Les modifications nécessitent une session administrateur.

## Sécurité et déploiement

- Les mots de passe ne sont ni stockés dans la base ni conservés dans le dépôt. Le serveur compare les identifiants avec `scrypt` et une comparaison à temps constant.
- Le cookie de session est `HttpOnly`, `SameSite=Strict`, limité à la durée de la session et marqué `Secure` lorsque `NODE_ENV=production`.
- Les routes qui modifient des données vérifient l’en-tête `Origin`; les connexions et les envois de messages sont limités en fréquence.
- Les données sont validées côté serveur, les requêtes SQLite sont paramétrées, et le client construit le contenu avec les API DOM plutôt qu’avec `innerHTML`.
- Une politique CSP et plusieurs en-têtes de sécurité sont appliqués. Seuls les fichiers web explicitement listés sont servis.
- Le serveur n’active ni CORS ni la confiance automatique envers les en-têtes de proxy. En production, placez-le derrière un proxy HTTPS configuré et définissez `PUBLIC_ORIGIN` sur l’origine HTTPS exacte du site. N’exposez jamais le serveur de développement tel quel sur Internet.

Variables disponibles : `PORT` (3000 par défaut), `HOST` (`127.0.0.1` par défaut), `DATABASE_PATH` (fichier SQLite par défaut dans `data/`) et `PUBLIC_ORIGIN` (utile derrière un proxy HTTPS).

## Vérification

```powershell
npm test
```

`node_modules/`, les fichiers `.env` et la base SQLite sont exclus de Git.

## Suivi Git demandé pour l’examen

Créez le dépôt GitHub du projet, invitez les formateurs dès le début, puis faites chaque jour un commit avec un message décrivant l’avancement et poussez-le sur GitHub. Vérifiez que `node_modules/`, les mots de passe et la base de données ne sont jamais ajoutés au dépôt.

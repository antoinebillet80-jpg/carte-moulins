FROM node:18-alpine

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci

# Ajouter une étape qui invalide le cache à chaque build
ARG BUILD_ID
RUN echo "Build ID: ${BUILD_ID}"

# Copier le code source
COPY . .

# Exposer le port
EXPOSE 3000

# Lancer le serveur
CMD ["npm", "run", "server"]

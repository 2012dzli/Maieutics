# Serve Teaching Small Models to Learn fully offline (no Perchance engine, no keys).
#
# What gets served: index.html + src/*.js only.
# main.pjs and imports/ are Perchance-only and are NOT copied (ignored offline).
#
# Build + run locally:
#   docker build -t latent-lab:offline .
#   docker run -p 8080:80 latent-lab:offline
# Then open http://localhost:8080/

FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY src/ /usr/share/nginx/html/src/
EXPOSE 80

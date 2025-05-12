FROM nginx

MAINTAINER Sebastiaan Renkens <srenkens@gmail.com>

# Copy the nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the game files
ADD html5-wolfenstein3D /usr/share/nginx/html

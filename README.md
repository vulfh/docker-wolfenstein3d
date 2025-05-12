# docker-wolfenstein3d
HTML5 version of Wolfenstein3D running in Docker


## How to run
It's so easy
```
git clone https://github.com/srenkens/docker-wolfenstein3d
cd docker-wolfenstein3d/
docker build --no-cache --tag wolfenstein3d-dev-1 .
docker-compose up --build

docker rm -f wolfenstein3d-dev
docker run --rm -p 8888:80 --name wolfcontainer-dev wolfenstein3d-dev
```

Point your browser to whatever your docker engine is running. For example, if it's running on localhost: [http://localhost:8888/](http://localhost:8888/)

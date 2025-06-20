FROM node:slim
WORKDIR /app
RUN sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources 
RUN apt update -y &&\
    apt dist-upgrade -y &&\
    apt install curl net-tools vim wget bash -y
COPY package.json .
RUN npm install 
COPY app.js  .
RUN chmod +x app.js 
CMD ["node", "app.js"]

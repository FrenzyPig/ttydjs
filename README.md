# ttydjs
nodejs + ttyd 
实现 vless 代理

`const UUID = process.env.UUID || 'a2c803ad-84dd-4ad7-9580-be9be3f7e1af';`

`const PORT = process.env.PORT || 10000;`

`const DOMAIN = process.env.DOMAIN || 'node.js';`

主要逻辑源于 ygkkk 的源码修改,添加了ttyd的功能...用于 web.freecloud.ltd . 

当用于 web.freecloud.ltd 需要手工修改 以上三个值

当用于 docker 运行,可以使用` -e DOMAIN=xxxxxx.com ` 这种带入参数.

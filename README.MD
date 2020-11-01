**NodeJS auto balancing cluster.**

Cluster initialization allows to create multi instance Master-Worker cluster.
User can specify a few parameters:

```startServer (required)``` - function that starts server instance

```minWorkersAmount (optional, default - 1)``` - min amount of server instances

```maxWorkersAmount (optional, default - system cpus amount)``` - max amount of server instances

```maxWorkersDelay (optional, default - 1000ms)``` - time of instance response that means that instance is slow

```workerStateCheckInterval (optional, default - 5000ms)``` - interval of checking instanced delay



**Usage example:**
```
const http = require('http');
const nodejsCluster = require('node-autobalanced-cluster');

const startServer = () => {
    http.createServer((req, res) => {
        res.writeHead(200);
        res.end('hello world');
    }).listen(3000);
};

nodejsCluster.init({
    startServer,
    minWorkersAmount: 1,
    maxWorkersAmount: 10,
    maxWorkersDelay: 1000,
    workerStateCheckInterval: 5000
});
```

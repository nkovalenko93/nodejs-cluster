const cluster = require('cluster');
const OS = require('os');
const fs = require('fs');


const DEFAULT_MIN_WORKERS_AMOUNT = 1;
const DEFAULT_MAX_WORKERS_AMOUNT = OS.cpus().length;
const DEFAULT_MAX_WORKERS_DELAY = 1000;
const DEFAULT_WORKER_STATE_CHECK_INTERVAL = 5000;


const throwValidationError = message => {
    console.error(message);
    throw new Error(message);
};


let workers = [];
let clusterLoadingMonitor = {};


const isWorkerAlive = worker => (!worker.isDead() && worker.isConnected());


const addWorkers = amount => {
    for (let i = 0; i < amount; i++) {
        const worker = cluster.fork();
        worker.on('message', startTime => {
            clusterLoadingMonitor[worker.process.pid] = ((new Date()).getTime() - startTime);
        });
        workers.push(worker);
    }
};


const removeWorkers = amount => {
    const sortedWorkers = workers.sort((a, b) => {
        if (clusterLoadingMonitor[a.process.pid] > clusterLoadingMonitor[b.process.pid]) {
            return 1;
        } else if (clusterLoadingMonitor[a.process.pid] < clusterLoadingMonitor[b.process.pid]) {
            return -1;
        }
        return 0;
    });

    for (let i = 0; i < amount; i++) {
        const worker = sortedWorkers[i];
        worker.kill();
    }
};


const adjustWorkersAmount = (minWorkersAmount, maxWorkersAmount, maxWorkersDelay) => {
    const freeWorkers = Object.keys(clusterLoadingMonitor).filter(key => (clusterLoadingMonitor[key] < maxWorkersDelay)).length;
    let neededWorkersAmount = (minWorkersAmount - freeWorkers);
    if (neededWorkersAmount) {
        let realAmount = neededWorkersAmount;
        if (neededWorkersAmount > 0) {
            if ((realAmount + workers.length) > maxWorkersAmount) {
                realAmount = (maxWorkersAmount - workers.length);
            }
            if (realAmount && (realAmount > 0)) {
                addWorkers(neededWorkersAmount);
            }
        } else {
            if ((workers.length - realAmount) < minWorkersAmount) {
                realAmount = (workers.length - minWorkersAmount);
            }
            if (realAmount && (realAmount < 0)) {
                removeWorkers(-neededWorkersAmount);
            }
        }
    }
};


const refreshWorkersLoading = minWorkersAmount => new Promise(async resolve => {
    clusterLoadingMonitor = {};

    await Promise.all(
        workers.map(
            worker => new Promise(
                actionResolve => {
                    worker.send((new Date()).getTime());
                    actionResolve();
                }
            )
        )
    );

    const interval = setInterval(
        () => {
            const responsedWorkerPids = Object.keys(clusterLoadingMonitor).filter(key => (
                clusterLoadingMonitor[key] ||
                (clusterLoadingMonitor[key] === 0)
            ));
            if (responsedWorkerPids.length >= minWorkersAmount) {
                clearInterval(interval);
                resolve();
            }
        },
        100
    );
});


const updateWorkersStatus = async (minWorkersAmount, maxWorkersAmount, maxWorkersDelay) => {
    workers = workers.filter(isWorkerAlive);
    if (workers.length) {
        await refreshWorkersLoading(minWorkersAmount);
        adjustWorkersAmount(minWorkersAmount, maxWorkersAmount, maxWorkersDelay);
    } else {
        addWorkers(minWorkersAmount);
    }
    workers = workers.filter(isWorkerAlive);
    console.log('current instances', workers.length);
};


const initCluster = async (
    {
        startServer,
        minWorkersAmount = DEFAULT_MIN_WORKERS_AMOUNT,
        maxWorkersAmount = DEFAULT_MAX_WORKERS_AMOUNT,
        maxWorkersDelay = DEFAULT_MAX_WORKERS_DELAY,
        workerStateCheckInterval = DEFAULT_WORKER_STATE_CHECK_INTERVAL
    }
) => {
    if (!startServer || ((typeof startServer) !== 'function')) {
        throwValidationError('"startServer" function must be provided.');
    }

    if (minWorkersAmount && ((typeof minWorkersAmount) !== 'number')) {
        throwValidationError('"minWorkersAmount" must be a number.');
    }

    if (maxWorkersAmount && ((typeof maxWorkersAmount) !== 'number')) {
        throwValidationError('"maxWorkersAmount" must be a number.');
    }

    if (maxWorkersDelay && ((typeof maxWorkersDelay) !== 'number')) {
        throwValidationError('"maxWorkersDelay" must be a number.');
    }

    if (workerStateCheckInterval && ((typeof workerStateCheckInterval) !== 'number')) {
        throwValidationError('"workerStateCheckInterval" must be a number.');
    }

    if (minWorkersAmount > DEFAULT_MAX_WORKERS_AMOUNT) {
        console.warn(
            `Min workers amount passed ${minWorkersAmount} is more than max CPUs ${DEFAULT_MAX_WORKERS_AMOUNT}.`,
            `${DEFAULT_MAX_WORKERS_AMOUNT} will be used instead.`
        );
        minWorkersAmount = DEFAULT_WORKER_STATE_CHECK_INTERVAL;
    }

    if (maxWorkersAmount > DEFAULT_MAX_WORKERS_AMOUNT) {
        console.warn(
            `Max workers amount passed ${maxWorkersAmount} is more than max CPUs ${DEFAULT_MAX_WORKERS_AMOUNT}.`,
            `${DEFAULT_MAX_WORKERS_AMOUNT} will be used instead.`
        );
        maxWorkersAmount = DEFAULT_MAX_WORKERS_AMOUNT;
    }

    if (cluster.isMaster) {
        console.info(`Master ${process.pid} is running.`);
        addWorkers(minWorkersAmount);

        cluster.on('exit', (worker, code, signal) => {
            console.warn(`Worker ${worker.process.pid} died: code - ${code}, signal - ${signal}.`);
        });

        const triggerMonitorPromise = () => setTimeout(
            async () => {
                await updateWorkersStatus(minWorkersAmount, maxWorkersAmount, maxWorkersDelay);
                triggerMonitorPromise();
            },
            workerStateCheckInterval
        );
        triggerMonitorPromise();
    } else {
        process.on('message', startTime => process.send(startTime));
        startServer();
        console.info(`Worker ${process.pid} started.`);
    }
};


module.exports.init = initCluster;

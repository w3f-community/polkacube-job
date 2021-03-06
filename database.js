require("dotenv").config();
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
});

const promisePool = pool.promise();
let database = {};

async function querySql(sql, params) {
    return await promisePool.query(sql, [params])
        .then(([rows, fields]) => {
            return [rows, fields];
        })
        .catch((error) => {
            console.error(
                `database error:
sql: ${sql},
error: ${error}`);
            process.exit(-1);
        });
}

database.getLastRewardEventPercent = async function () {
    const [rows, fields] = await querySql(
            `SELECT a.v/(a.v+a.t) AS percent FROM 
                (SELECT cast(validatorsAmount AS UNSIGNED INTEGER) AS v, 
                        cast(treasuryAmount AS UNSIGNED INTEGER) AS t
                 FROM ksm_evt_reward
                 ORDER BY height DESC 
                 LIMIT 1
                 ) a;`);
    return rows[0].percent;
};

database.getLastBlockProcessed = async function () {
    const [rows, fields] = await querySql(
            `SELECT max(height) AS height 
                 FROM ksm_block`,
        []);
    return rows[0].height;
};

database.saveTokenDistribution = async function (d) {
    console.info(`Save token: #${d.height}`);
    let sql = `REPLACE INTO ksm_token (
                        height, 
                        currentEra,
                        currentSession,
                        totalIssuance, 
                        totalBond, 
                        validatorsCount, 
                        stakingRatio, 
                        inflation, 
                        valDayRewards) 
                    VALUES ( 
                        ${d.height}, 
                        ${d.currentEra}, 
                        ${d.currentIndex}, 
                        ${d.totalIssuance}, 
                        ${d.totalBond},
                        ${d.validatorsCount}, 
                        ${d.stakingRatio}, 
                        ${d.inflation},
                        ${d.rewardPerValPerDay});`;

    return await querySql(sql, []);
};

database.saveValidators = async function (header, data) {
    console.info(`Save validators: #${header.number}`);
    let sqlInsert = `INSERT INTO ksm_validator (
                        height,
                        currentEra,
                        currentSession,
                        validatorAddr,
                        validatorName,
                        controllerAddr,
                        controllerName,
                        online,
                        eraPoint,
                        rewardDestination,
                        commission,
                        totalBonded,
                        selfBonded,
                        nominators)
                    VALUES ? 
                    ON DUPLICATE KEY UPDATE 
                    ksm_validator.height = VALUES(ksm_validator.height),
                    ksm_validator.online = VALUES(ksm_validator.online),
                    ksm_validator.eraPoint = VALUES(ksm_validator.eraPoint)
                    ;`;
    let sqlParams = [];
    for (const row of data) {
        sqlParams.push([
            header.number.toNumber(),
            row.currentEra,
            row.currentIndex,
            row.validatorAddr,
            row.validatorName,
            row.controllerAddr,
            row.controllerName,
            row.online,
            row.eraPoint,
            row.rewardDestination,
            row.commission,
            row.totalBonded,
            row.selfBonded,
            row.nominators
        ]);
    }
    return await querySql(sqlInsert, sqlParams);
};

database.saveBlocks = async function (data) {
    if (data.length === 0) {
        return
    }
    console.info(`Save block: #${data[0].number} ~ #${data[data.length - 1].number}`);
    let sqlInsert = `INSERT IGNORE INTO ksm_block (
                        height, 
                        hash, 
                        authorAddr) 
                    VALUES ?;`;
    let sqlParams = [];
    for (const row of data) {
        sqlParams.push([
            row.number,
            row.hash.toHex(),
            row.authorAddr
        ])
    }
    return await querySql(sqlInsert, sqlParams);
};

database.saveAuthor = async function (data) {
    console.info(`Save author: #${data.number}`);
    let sql = `REPLACE INTO ksm_author (
                        authorAddr, 
                        lastBlockHeight,
                        lastBlockHash) 
                    VALUES ( 
                        '${data.authorAddr}',
                        ${data.number},
                        '${data.hash.toHex()}');`;
    return await querySql(sql, []);
};

database.saveRewardEvents = async function (header, data) {
    if (data.length === 0) {
        return
    }
    console.info(`Save staking.Reward event: #${header.number}`);
    let sqlInsert = `INSERT IGNORE INTO ksm_evt_reward (
                        height, 
                        \`index\`, 
                        validatorsAmount,
                        treasuryAmount) 
                    VALUES ?;`;
    let sqlParams = [];
    for (const row of data) {
        sqlParams.push([
            header.number,
            row.index,
            row.validatorsAmount,
            row.treasuryAmount
        ])
    }
    return await querySql(sqlInsert, sqlParams);
};

database.saveSlashEvents = async function (header, data) {
    if (data.length === 0) {
        return
    }
    console.info(`Save staking.Slash event: #${header.number}`);
    let sqlInsert = `INSERT IGNORE INTO ksm_evt_slash (
                        height, 
                        \`index\`,
                        accountAddr,
                        nickname,
                        amount) 
                    VALUES ?;`;
    let sqlParams = [];
    for (const row of data) {
        sqlParams.push([
            header.number,
            row.index,
            row.accountAddr,
            row.nickname,
            row.amount
        ])
    }
    return await querySql(sqlInsert, sqlParams);
};

module.exports = database;

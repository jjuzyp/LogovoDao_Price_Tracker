import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

function createLogger() {
    const logDir = path.join(process.cwd(), 'logs');
    
    if (!fs.existsSync(logDir)){
        fs.mkdirSync(logDir);
    }

    const logFileName = `${new Date().toISOString().split('T')[0]}_log.txt`;
    const logFilePath = path.join(logDir, logFileName);

    return {
        log: (message) => {
            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] ${message}\n`;
            
            fs.appendFile(logFilePath, logMessage, (err) => {
                if (err) logger.error('Error writing log:', err);
            });
            
            console.log(logMessage.trim());
        },
        error: (message) => {
            const timestamp = new Date().toISOString();
            const errorMessage = `[ERROR][${timestamp}] ${message}\n`;
            
            fs.appendFile(logFilePath, errorMessage, (err) => {
                if (err) logger.error('Error writing log:', err);
            });
            
            console.error(errorMessage.trim());
        }
    };
}

const logger = createLogger();



dotenv.config();
const telegramToken = process.env.TELEGRAM_TOKEN;
const RPC = process.env.RPC;
const bot = new TelegramBot(telegramToken, { polling: true });

bot.on("polling_error", (error) => {
    logger.error("Polling error:", error);
});

let userTasks = {};

async function fetchTokenSymbol(tokenAddress) {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        logger.log(`Task ${task.taskName} successfully processed `)
        return data.pairs[0].baseToken.symbol; // returning token symbol
        
    } catch (error) {
        logger.error('Error fetching token symbol:', error);
        return null;
    }
}


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🔥 Wellcome to LogovoPriceTrackerBot, this bot tracks solana token price changes! For more information use "Help" button!     ⚠️Every time bot got updates your tasks gonna be deleted! I do not store any of your data!', createInlineMenu());
});


function createInlineMenu() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Add task', callback_data: 'add_task' }],
                [{ text: 'Task list', callback_data: 'task_list' }, { text: 'Delete task', callback_data: 'delete_task' }],
                [{ text: 'Delete all tasks', callback_data: 'delete_all_tasks' }, { text: 'Help', callback_data: 'help' }],
                [{ text: 'Back', callback_data: 'back_to_menu' }]
            ]
        }
    };
}


bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const action = callbackQuery.data;

    bot.answerCallbackQuery(callbackQuery.id);

    switch (action) {
        case 'add_task':
            bot.editMessageText('Enter task name:', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Back', callback_data: 'back_to_menu' }]
                    ]
                }
            });

            bot.once('message', (msg) => {
                const taskName = msg.text;
                bot.editMessageText('Choose your task type:', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'MCap change', callback_data: 'task_mcap_change' }],
                            [{ text: 'MCap target hit', callback_data: 'task_mcap_target' }],
                            [{ text: 'back', callback_data: 'back_to_menu' }]
                        ]
                    }
                });
                bot.once('callback_query', async (callbackQuery) => {
                    const taskType = callbackQuery.data;
                    
                    if (taskType === 'back_to_menu') {
                        bot.editMessageText('🔥 Wellcome to LogovoPriceTrackerBot, this bot tracks solana token price changes! For more information use "Help" button!     ⚠️Every time bot got updates your tasks gonna be deleted! I do not store any of your data!', {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: createInlineMenu().reply_markup
                        });
                        return;
                    }
                    bot.editMessageText('Enter your token address:', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'Back', callback_data: 'back_to_menu' }]
                            ]
                        }
                    });

                    bot.once('message', async (msg) => {
                        const tokenAddress = msg.text;
                        const tokenSymbol = await fetchTokenSymbol(tokenAddress);
    
                    
                        if (!tokenSymbol) {
                            bot.editMessageText('Wrong token address. Please try again.', {
                                chat_id: chatId,
                                message_id: messageId,
                                reply_markup: createInlineMenu().reply_markup
                            });
                            return;
                        }
                        
                        if (taskType === 'task_mcap_change') {
                            bot.editMessageText('Enter MCap change:', {
                                chat_id: chatId,
                                message_id: messageId
                            });

                    bot.once('message', async (msg) => {
                        const targetMCapChange = parseFloat(msg.text);
                        
                        if (isNaN(targetMCapChange)) {
                            bot.editMessageText('Pls, enter correct MCap change.', {
                                chat_id: chatId,
                                message_id: messageId,
                                reply_markup: createInlineMenu().reply_markup
                            });
                            return;
                        }

                        if (!userTasks[chatId]) {
                            userTasks[chatId] = [];
                        }

                        userTasks[chatId].push({ 
                            taskName, 
                            tokenAddress, 
                            tokenSymbol, 
                            targetMCapChange, 
                            chatId, 
                            lastMCap: 0,
                            type: 'mcap_change'
                        });

                        bot.editMessageText(`Task added: ${taskName} ($${tokenSymbol})with MCap change: ${Math.round(targetMCapChange).toLocaleString('de-DE')}`, {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: createInlineMenu().reply_markup
                        });
                        startTrackingTasks();
                    });
                } else if (taskType === 'task_mcap_target') {
                    bot.editMessageText('Enter MCap target hit:', {
                        chat_id: chatId,
                        message_id: messageId
                    });
                    bot.once('message', async (msg) => {
                        const targetMCap = parseFloat(msg.text);

                        if (isNaN(targetMCap)) {
                            bot.editMessageText('Pls, enter correct MCap change.', {
                                chat_id: chatId,
                                message_id: messageId,
                                reply_markup: createInlineMenu().reply_markup
                            });
                            return;
                        }
                        
                        if (!userTasks[chatId]) {
                            userTasks[chatId] = [];
                        }

                        userTasks[chatId].push({ 
                            taskName, 
                            tokenAddress,
                            tokenSymbol, 
                            chatId, 
                            type: 'mcap_target',
                            targetMCap: targetMCap,
                            notified: false
                        });
                        bot.editMessageText(`Task added: ${taskName} ($${tokenSymbol})with target MCap: ${Math.round(targetMCap).toLocaleString('de-DE')}`, {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: createInlineMenu().reply_markup
                        });
                        startTrackingTasks();
                    });
                }
            });
        });
    });

    break;

        case 'task_list':
            if (!userTasks[chatId] || userTasks[chatId].length === 0) {
                bot.editMessageText('No active tasks.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: createInlineMenu().reply_markup
                });
                return;
            }
            
            const taskList = userTasks[chatId].map((task, index) => {
                if (task.type === 'mcap_change') {
                    return `${index + 1}. ${task.taskName} - ${task.tokenAddress} - $${task.tokenSymbol} - MCap target change: ${Math.round(task.targetMCapChange).toLocaleString('de-DE')}`;
                } else if (task.type === 'mcap_target') {
                    return `${index + 1}. ${task.taskName} - ${task.tokenAddress} - $${task.tokenSymbol} - MCap target hit: ${Math.round(task.targetMCap).toLocaleString('de-DE')}`;
                }
            }).join('\n');
            
            bot.editMessageText(`Active tasks:\n${taskList}`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: createInlineMenu().reply_markup
            });
            break;
        

        case 'delete_task':
            if (!userTasks[chatId] || userTasks[chatId].length === 0) {
                bot.editMessageText('No tasks to delete.', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: createInlineMenu().reply_markup
                });
                return;
            }

            bot.editMessageText('Enter task number to delete:', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Back', callback_data: 'back_to_menu' }]
                    ]
                }
            });

            bot.once('message', (msg) => {
                const taskIndex = parseInt(msg.text) - 1;
                if (taskIndex >= 0 && taskIndex < userTasks[chatId].length) {
                    userTasks[chatId].splice(taskIndex, 1);
                    bot.editMessageText('Task have been deleted.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: createInlineMenu().reply_markup
                    });
                } else {
                    bot.editMessageText('Incorrect task number.', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: createInlineMenu().reply_markup
                    });
                }
            });
            break;

        case 'delete_all_tasks':
            userTasks[chatId] = [];
            bot.editMessageText('All tasks have been deleted.', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: createInlineMenu().reply_markup
            });
            break;

        case 'help':
            bot.editMessageText('Avaliable options:\n- Add task - Add new task\n- Task list - Active task list\n- Delete task - Delete 1 task\n- Delete all tasks - Delete all existing tasks\n- Bot guide - jjuzyp.gitbook.io/logovopricetrackerbot-guide\n Made by https://t.me/AXAXAXAXAXAXAXAXAXAXAXXAXAXAA', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: createInlineMenu().reply_markup
            });
            break;

        case 'back_to_menu':
            bot.editMessageText('🔥 Wellcome to LogovoPriceTrackerBot, this bot tracks solana token price changes! For more information use "Help" button!     ⚠️Every time bot got updates your tasks gonna be deleted! I do not store any of your data!', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: createInlineMenu().reply_markup
            });
            break;
    }
});

async function fetchTokenPrice(tokenAddress) {
    try {
        const response = await fetch(`https://api.jup.ag/price/v2?ids=${tokenAddress}&onlyDirectRoutes=true`);
        if (!response.ok) {
            logger.error(`Error fetching price for ${tokenAddress}:`, response.status);
            return null;
        }

        const data = await response.json();
        return parseFloat(data.data[tokenAddress].price);
    } catch (error) {
        logger.error('Error fetching token price:', error);
        return null;
    }
}

async function fetchCirculatingSupply(tokenAddress) {
    try {
        const response = await fetch(RPC, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getTokenSupply",
                params: [tokenAddress]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        logger.log(data.result.value.uiAmountString);
        return data.result.value.uiAmountString || 1_000_000_000; // returning amount or 1 billion as a default for shitcoin
    } catch (error) {
        logger.error('Error fetching circulating supply:', error);
        return null;
    }
}

async function fetchData(task) {
    const { tokenAddress, chatId, taskName, tokenSymbol, type  } = task;

    logger.log(`Fetching data for task: ${task.taskName}`);

    try {

        const circulatingSupply = await fetchCirculatingSupply(tokenAddress);
        const price = await fetchTokenPrice(tokenAddress);
        if (!price || !circulatingSupply) return;
        logger.log(price);

        const currentMCap = price * circulatingSupply;
        logger.log(Math.round(currentMCap).toLocaleString('de-DE'));
        
        if (type === 'mcap_change') {
            const mCapChange = Math.abs(currentMCap - task.lastMCap);
            if (mCapChange >= task.targetMCapChange) {
                const formattedMCap = Math.round(currentMCap).toLocaleString('de-DE');
                await bot.sendMessage(chatId, `⚡ MCap changed for $${tokenSymbol}(${taskName}): ${formattedMCap}, Target change: ${Math.round(task.targetMCapChange).toLocaleString('de-DE')}`);
                task.lastMCap = currentMCap; 
            }
        } else if (type === 'mcap_target') {
            if (!task.lastMCap) {
                task.lastMCap = currentMCap;
            }
            const crossedUp = task.lastMCap < task.targetMCap && currentMCap >= task.targetMCap;
            const crossedDown = task.lastMCap > task.targetMCap && currentMCap <= task.targetMCap;

            if (crossedUp || crossedDown) {
                const direction = crossedUp ? '📈 outbid' : '📉 downbid';
                const formattedMCap = Math.round(currentMCap).toLocaleString('de-DE');
                const formattedTargetMCap = Math.round(task.targetMCap).toLocaleString('de-DE');
    
                await bot.sendMessage(chatId, `Token $${tokenSymbol}(${taskName}) ${direction} Target MCap: ${formattedTargetMCap}. Current MCap: ${formattedMCap}`);
                
                task.lastMCap = currentMCap;
            }
        }
    }catch (error) {
        logger.error('Error in fetchData:', error);
}
}
let trackingStarted = false;

function startTrackingTasks() {
    if (trackingStarted) return;
    trackingStarted = true;
    
    setInterval(async () => {
        for (const chatId in userTasks) {
            if (userTasks[chatId]) {
                for (const task of userTasks[chatId]) {
                    await fetchData(task);
                    await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 before next task update
                }
            }
        }
    }, 10000); // fetching every 10 seconds
}

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'jjuzyp.gitbook.io/logovopricetrackerbot-guide');
});
import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const telegramToken = process.env.TELEGRAM_TOKEN;
const RPC = process.env.RPC;
const bot = new TelegramBot(telegramToken, { polling: true });

bot.on("polling_error", (error) => {
    console.error("Polling error:", error);
});

let circulatingSupply = 0;
let userTasks = {};

async function fetchTokenSymbol(tokenAddress) {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.pairs[0].baseToken.symbol; // returning token symbol
    } catch (error) {
        console.error('Error fetching token symbol:', error);
        return null;
    }
}


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Wellcome to LogovoPriceTrackerBot, this bot tracks solana token price changes! For more information use "Help" button! Choose your option:', createInlineMenu());
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

let waitingForInput = false;

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const action = callbackQuery.data;

    bot.answerCallbackQuery(callbackQuery.id);

    if (waitingForInput) {
        bot.editMessageText('You are currently in input action(creating task), pls end it before continuing.', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: createInlineMenu().reply_markup
        });
        return;
    }

    switch (action) {
        case 'add_task':
            waitingForInput = true;
            bot.editMessageText('Enter task name:', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Back', callback_data: 'back_to_menu' }]
                    ]
                }
            });

            // Сохраняем контекст для последующих шагов
            bot.once('message', (msg) => {
                const taskName = msg.text;
                bot.editMessageText('Enter your token address (tokenAddress):', {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'back', callback_data: 'back_to_menu' }]
                        ]
                    }
                });

                bot.once('message', async (msg) => {
                    const tokenAddress = msg.text;
                    const tokenSymbol = await fetchTokenSymbol(tokenAddress);
                    
                    if (!tokenSymbol) {
                        bot.editMessageText('Wrong token address. Please, try again.', {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: createInlineMenu().reply_markup
                        });
                        waitingForInput = false;
                        return;
                    }

                    bot.editMessageText('Enter MCap change:', {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'Back', callback_data: 'back_to_menu' }]
                            ]
                        }
                    });

                    bot.once('message', async (msg) => {
                        const targetMCapChange = parseFloat(msg.text);
                        
                        if (isNaN(targetMCapChange)) {
                            bot.editMessageText('Pls, enter correct MCap change.', {
                                chat_id: chatId,
                                message_id: messageId,
                                reply_markup: createInlineMenu().reply_markup
                            });
                            waitingForInput = false;
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
                            lastMCap: 0 
                        });

                        bot.editMessageText(`Task added: ${taskName} (${tokenAddress}) with MCap change: ${targetMCapChange}`, {
                            chat_id: chatId,
                            message_id: messageId,
                            reply_markup: createInlineMenu().reply_markup
                        });

                        waitingForInput = false;
                        startTrackingTasks();
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
            
            const taskList = userTasks[chatId].map((task, index) => 
                `${index + 1}. ${task.taskName} - ${task.tokenAddress} - $${task.tokenSymbol} - Целевое изменение: ${task.targetMCapChange}`
            ).join('\n');
            
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
                    bot.editMessageText('Задача удалена.', {
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
            bot.editMessageText('Avaliable options:\n- Add task - Add new task\n- Task list - Active task list\n- Delete task - Delete 1 task\n- Delete all tasks - Delete all existing tasks\n- Help - Help\n- jjuzyp.gitbook.io/logovopricetrackerbot-guide', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: createInlineMenu().reply_markup
            });
            break;

        case 'back_to_menu':
            bot.editMessageText('Wellcome to LogovoPriceTrackerBot, this bot tracks solana token price changes! For more information use "Help" button! Choose your option:', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: createInlineMenu().reply_markup
            });
            waitingForInput = false;
            break;

        default:
            bot.editMessageText('Неизвестное действие.', {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: createInlineMenu().reply_markup
            });
            break;
    }
});


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
        console.log(data.result.value.uiAmountString);
        return data.result.value.uiAmountString || 1_000_000_000; // returning amount or 1 billion as a default for shitcoin
    } catch (error) {
        console.error('Error fetching circulating supply:', error);
        return null;
    }
}

async function fetchData(task) {
    const { tokenAddress, targetMCapChange, chatId, lastMCap, taskName, tokenSymbol } = task;

    console.log(`Fetching data for task: ${task.taskName}`);

    try {

        circulatingSupply = await fetchCirculatingSupply(tokenAddress);

        const response = await fetch(`https://api.jup.ag/price/v2?ids=${tokenAddress}&onlyDirectRoutes=true`);
        if (!response.ok) {
            console.error(`Error fetching price for ${tokenAddress}:`, response.status);
            return;
        }

        const data = await response.json();
        const price = parseFloat(data.data[tokenAddress].price);
        const currentMCap = price * circulatingSupply;

        const mCapChange = Math.abs(currentMCap - lastMCap);
        if (mCapChange >= targetMCapChange) {
            const formattedMCap = Math.round(currentMCap).toLocaleString('de-DE');
            await bot.sendMessage(chatId, `MCap changed for ${taskName} $${tokenSymbol}: ${formattedMCap}, Target change: ${targetMCapChange}`);
            task.lastMCap = currentMCap; 
        }
    } catch (error) {
        console.error('Error in fetchData:', error);
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
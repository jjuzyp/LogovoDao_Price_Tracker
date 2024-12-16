import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const telegramToken = process.env.TELEGRAM_TOKEN;

const bot = new TelegramBot(telegramToken, { polling: true });

let circulatingSupply = 0;
let tasks = []; 
let waitingForInput = false;
let userTasks = {};

async function fetchTokenSymbol(tokenAddress) {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.pairs[0].baseToken.symbol; // Возвращаем символ токена
    } catch (error) {
        console.error('Error fetching token symbol:', error);
        return null;
    }
}

function createMainMenu() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: 'Add task' }],
                [{ text: 'Task list' }, { text: 'Delete task' }],
                [{ text: 'Delete all tasks' }, { text: 'Help' }],  
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
}

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Bot is live! Choose your option:', createMainMenu());
});

bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (waitingForInput) {

        return;
    }

    if (text === 'Add task') {
        waitingForInput = true;
        bot.sendMessage(chatId, 'Enter task name:');
        bot.once('message', async (msg) => {
            const taskName = msg.text;
            bot.sendMessage(chatId, 'Enter your token address (tokenAddress):');
            bot.once('message', async (msg) => {
                const tokenAddress = msg.text;
                const tokenSymbol = await fetchTokenSymbol(tokenAddress);
                if (!tokenSymbol) {
                    return bot.sendMessage(chatId, 'Invalid token address. Please try again.');
                }
                bot.sendMessage(chatId, 'Enter MCap change:');
                bot.once('message', async (msg) => {
                    const targetMCapChange = parseFloat(msg.text);
                    waitingForInput = false;
                    if (isNaN(targetMCapChange)) {
                        return bot.sendMessage(chatId, 'Pls enter valid value for MCap change.');
                    }
                    if (!userTasks[chatId]) {
                        userTasks[chatId] = [];
                    }
                    userTasks[chatId].push({ taskName, tokenAddress, tokenSymbol, targetMCapChange, chatId, lastMCap: 0 });
                    console.log('Текущие задачи:', userTasks);
                    bot.sendMessage(chatId, `Task added: ${taskName} (${ tokenAddress}) with target MCap change: ${targetMCapChange}`);
                    startTrackingTasks();
                });
            });
        });
    }     else if (text === 'Task list') {
        if (!userTasks[chatId] || userTasks[chatId].length === 0) {
            return bot.sendMessage(chatId, 'No active tasks yet.');
        }
        const taskList = userTasks[chatId].map((task, index) => `${index + 1}. ${task.tokenAddress} - ${task.targetMCapChange}`).join('\n');
        bot.sendMessage(chatId, `Active tasks:\n${taskList}`);    
    } else if (text === 'Delete task') {
        if (!userTasks[chatId] || userTasks[chatId].length === 0) {
            return bot.sendMessage(chatId, 'No active tasks to delete.');
        }
        bot.sendMessage(chatId, 'Enter number of task to be deleted:');
        bot.once('message', (msg) => {
            const taskIndex = parseInt(msg.text) - 1;
            if (taskIndex >= 0 && taskIndex < userTasks[chatId].length) {
                userTasks[chatId].splice(taskIndex, 1); 
                bot.sendMessage(chatId, 'Task deleted.');
            } else {
                bot.sendMessage(chatId, 'Incorrect task number');
            }
        });
    } else if (text === 'Delete all tasks') {
        userTasks[chatId] = [];
        bot.sendMessage(chatId, 'All tasks have been deleted.');
    } else if (text === 'Help') {
        bot.sendMessage(chatId, 'Available options:\nAdd task - Add new task\nTask list - Active task list\nDelete task - Delete task\nDelete all tasks - Delete all tasks\nHelp - Help\njjuzyp.gitbook.io/logovopricetrackerbot-guide');
}});

async function fetchCirculatingSupply(tokenAddress) {
    try {
        const response = await fetch(`https://api.solana.fm/v1/tokens/${tokenAddress}/supply`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.realCirculatingSupply || 1_000_000_000; // Возвращаем реальное предложение или 1 миллиард по умолчанию
    } catch (error) {
        console.error('Error fetching circulating supply:', error);
        return null;
    }
}

async function fetchData(task) {
    const { tokenAddress, targetMCapChange, chatId } = task;
    
    if (circulatingSupply === 0) {
        circulatingSupply = await fetchCirculatingSupply(tokenAddress);
        if (circulatingSupply === null) return;
    }
    
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${tokenAddress}&onlyDirectRoutes=true`);
    if (!response.ok) {
        console.error(`Error fetching price for ${tokenAddress}:`, response.status);
        return;
    }

    const data = await response.json();
    const price = parseFloat(data.data[tokenAddress].price);
    const currentMCap = price * circulatingSupply;

    const mCapChange = Math.abs(currentMCap - task.lastMCap);
    if (mCapChange >= targetMCapChange) {
        const formattedMCap = Math.round(currentMCap).toLocaleString('de-DE');
        await bot.sendMessage(chatId, `MCap changed for ${task.tokenSymbol}: ${formattedMCap} (Target change: ${targetMCapChange})`);
        task.lastMCap = currentMCap;
    }
    
}

function startTrackingTasks() {
    setInterval(() => {
        for (const chatId in userTasks) {
            if (userTasks[chatId]) {
                userTasks[chatId].forEach(task => fetchData(task));
            }
        }
    }, 5000); // раз в 5 секунд фетч
}

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '');
});
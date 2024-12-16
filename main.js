import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const telegramToken = process.env.TELEGRAM_TOKEN;

const bot = new TelegramBot(telegramToken, { polling: true });

let circulatingSupply = 0;
let tasks = []; 
let waitingForInput = false;


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
         
        bot.sendMessage(chatId, 'Enter your token address (tokenAddress):');
        bot.once('message', async (msg) => {
            const tokenAddress = msg.text;
            bot.sendMessage(chatId, 'Enter MCap change:');
            bot.once('message', async (msg) => {
                const targetMCapChange = parseFloat(msg.text);
                waitingForInput = false; 
                if (isNaN(targetMCapChange)) {
                    return bot.sendMessage(chatId, 'Pls enter valid value for MCap change.');
                }
                tasks.push({ tokenAddress, targetMCapChange, chatId, lastMCap: 0 });
                bot.sendMessage(chatId, `Task added: ${tokenAddress} with Mcap change ${targetMCapChange}`);
                startTrackingTasks();

            });
        });
    } else if (text === 'Task list') {
        if (tasks.length === 0) {
            return bot.sendMessage(chatId, 'No active tasks yet.');
        }
        const taskList = tasks.map((task, index) => `${index + 1}. ${task.tokenAddress} - ${task.targetMCapChange}`).join('\n');
        bot.sendMessage(chatId, `Active tasks:\n${taskList}`);
    } else if (text === 'Delete task') {
        bot.sendMessage(chatId, 'Enter number of task to be deleted:');
        bot.once('message', (msg) => {
            const taskIndex = parseInt(msg.text) - 1;
            if (taskIndex >= 0 && taskIndex < tasks.length) {
                tasks.splice(taskIndex, 1);
                bot.sendMessage(chatId, 'Task deleted.');
            } else {
                bot.sendMessage(chatId, 'Incorrect task number');
            }
        });
    } else if (text === 'Delete all tasks') {
        tasks = [];
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

    if (Math.abs(currentMCap - task.lastMCap) >= targetMCapChange) {
        const formattedMCap = Math.round(currentMCap).toLocaleString('de-DE');
        await bot.sendMessage(chatId, `MCap changed for ${tokenAddress}: ${formattedMCap}`);
        task.lastMCap = currentMCap;
    }
}

function startTrackingTasks() {
    setInterval(() => {
        tasks.forEach(task => fetchData(task));
    }, 5000); // раз в 5 секунд фетч
}

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '');
});
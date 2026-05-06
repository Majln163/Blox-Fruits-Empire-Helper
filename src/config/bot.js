export const botConfig = {
    prefix: '!',


    leveling: {
        xpPerMessage: 15,
        xpCooldown: 60000,
        levelUpMessage: 'Congratulations {user}! You reached level {level}!',
        levelUpChannel: null,
    },

    tickets: {
        priorities: {
            none:   { emoji: '⚪', color: '#95A5A6', label: 'None' },
            low:    { emoji: '🟢', color: '#2ECC71', label: 'Low' },
            medium: { emoji: '🟡', color: '#F1C40F', label: 'Medium' },
            high:   { emoji: '🔴', color: '#E74C3C', label: 'High' },
            urgent: { emoji: '🚨', color: '#E91E63', label: 'Urgent' },
        },
        maxOpenPerUser: 3,
        transcriptChannel: null,
        closeOnInactive: false,
        inactiveThreshold: 48 * 60 * 60 * 1000,
    },

    verification: {
        defaultMessage: 'Click the button below to verify yourself and gain access to the server.',
        defaultButtonText: 'Verify',
        maxAttempts: 5,
        cooldown: 60000,
        autoVerify: {
            enabled: false,
            minAccountAge: 1,
            maxAccountAge: 365,
            defaultAccountAgeDays: 7,
        },
        maxInMemoryAuditEntries: 1000,
    },

    moderation: {
        muteRole: null,
        logChannel: null,
        autoMod: {
            enabled: false,
        },
    },

    giveaways: {
        reactionEmoji: '🎉',
    },

    embeds: {
        colors: {
            primary:   '#5865F2',
            secondary: '#4F545C',
            success:   '#43B581',
            error:     '#F04747',
            warning:   '#FAA61A',
            info:      '#00B0F4',
            gold:      '#F1C40F',
            purple:    '#9B59B6',
            dark:      '#2C2F33',
        },
    },

    messages: {
        noPermission:      "You don't have permission to use this command.",
        botNoPermission:   "I don't have permission to do that.",
        commandError:      'An error occurred while executing the command.',
        cooldown:          'You are on cooldown. Please wait {time}.',
        userNotFound:      'User not found.',
        invalidArgument:   'Invalid argument provided.',
        success:           'Operation completed successfully.',
        databaseError:     'A database error occurred. Please try again.',
        missingRole:       'You are missing the required role.',
        guildOnly:         'This command can only be used in a server.',
        maintenance:       'The bot is currently under maintenance.',
    },


};

export const BotConfig = botConfig;

export function getColor(path, fallback = '#000000') {
    const parts = path.split('.');
    let current = botConfig.embeds.colors;
    for (const part of parts) {
        if (current == null || current[part] === undefined) {
            return fallback;
        }
        current = current[part];
    }
    return typeof current === 'string' ? current : fallback;
}

export function getMessage(key, replacements = {}) {
    let message = botConfig.messages[key] || key;
    for (const [k, v] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return message;
}

export function validateConfig(config) {
    if (!config) throw new Error('Config is required');
    return true;
}

export default botConfig;

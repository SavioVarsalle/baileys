"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.waLabelAssociationKey = exports.waMessageID = exports.waChatKey = void 0;
const Defaults_1 = require("../Defaults");
const LabelAssociation_1 = require("../Types/LabelAssociation");
const object_repository_1 = require("./object-repository");

exports.waLabelAssociationKey = {
    key: (la) => (la.type === LabelAssociation_1.LabelAssociationType.Chat ? la.chatId + la.labelId : la.chatId + la.messageId + la.labelId),
    compare: (k1, k2) => k2.localeCompare(k1)
};
exports.default = (config) => {
    const labelAssociationKey = config.labelAssociationKey || exports.waLabelAssociationKey;
    const logger = config.logger || Defaults_1.DEFAULT_CONNECTION_CONFIG.logger.child({ stream: 'in-mem-store' });
    const state = { connection: 'close' };
    const labels = new object_repository_1.ObjectRepository();
    const labelAssociations = new KeyedDB(labelAssociationKey, labelAssociationKey.key);

    const labelsUpsert = (newLabels) => {
        for (const label of newLabels) {
            labels.upsertById(label.id, label);
        }
    };
    /**
     * binds to a BaileysEventEmitter.
     * It listens to all events and constructs a state that you can query accurate data from.
     * Eg. can use the store to fetch chats, contacts, messages etc.
     * @param ev typically the event emitter from the socket connection
     */
    const bind = (ev) => {
        ev.on('connection.update', update => {
            Object.assign(state, update);
        });
        ev.on('labels.edit', (label) => {
            if (label.deleted) {
                return labels.deleteById(label.id);
            }
            // WhatsApp can store only up to 20 labels
            if (labels.count() < 20) {
                return labels.upsertById(label.id, label);
            }
            logger.error('Labels count exceed');
        });
        ev.on('labels.association', ({ type, association }) => {
            switch (type) {
                case 'add':
                    labelAssociations.upsert(association);
                    break;
                case 'remove':
                    labelAssociations.delete(association);
                    break;
                default:
                    console.error(`unknown operation type [${type}]`);
            }
        });
    };
    const toJSON = () => ({
        labels,
        labelAssociations
    });
    const fromJSON = (json) => {
        labelAssociations.upsert(...json.labelAssociations || []);
        labelsUpsert(Object.values(json.labels || {}));
    };
    return {
        state,
        labels,
        labelAssociations,
        bind,
        
        /**
         * Get all available labels for profile
         *
         * Keep in mind that the list is formed from predefined tags and tags
         * that were "caught" during their editing.
         */
        getLabels: () => {
            return labels;
        },
        /**
         * Get labels for chat
         *
         * @returns Label IDs
         **/
        getChatLabels: (chatId) => {
            return labelAssociations.filter((la) => la.chatId === chatId).all();
        },
        toJSON,
        fromJSON,
        writeToFile: (path) => {
            // require fs here so that in case "fs" is not available -- the app does not crash
            const { writeFileSync } = require('fs');
            writeFileSync(path, JSON.stringify(toJSON()));
        },
        readFromFile: (path) => {
            // require fs here so that in case "fs" is not available -- the app does not crash
            const { readFileSync, existsSync } = require('fs');
            if (existsSync(path)) {
                logger.debug({ path }, 'reading from file');
                const jsonStr = readFileSync(path, { encoding: 'utf-8' });
                const json = JSON.parse(jsonStr);
                fromJSON(json);
            }
        }
    };
};

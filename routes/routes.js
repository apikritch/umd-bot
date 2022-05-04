const MessageController = require("./../controllers/MessageController");

module.exports = (app) => {
  app.post("/webhook", MessageController.messagePost);
};

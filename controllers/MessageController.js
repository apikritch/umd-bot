const AWS = require("aws-sdk");
const line = require("@line/bot-sdk");
const moment = require("moment-timezone");
const config = require("./../config/config.js");

AWS.config.update({
  region: process.env.AWS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = config.tableName;

const s3 = new AWS.S3();
const BUCKET_NAME = config.bucketName;

const client = new line.Client({
  channelAccessToken: config.channelAccessToken,
});

module.exports = {
  async messagePost(req, res) {
    const events = req.body.events;
    console.log(events);

    // Check Direct Chat
    if (!events[0].source.roomId && !events[0].source.groupId) {
      console.log("user: " + events[0].source.userId);
      return res.sendStatus(200);
    }

    // Check Room Chat
    if (events[0].source.roomId) {
      console.log("room: " + events[0].source.roomId);
      client.leaveRoom(events[0].source.roomId);
      return res.sendStatus(200);
    }

    // Check Group Join
    if (
      events[0].type == "join" &&
      events[0].source.groupId !== config.groupId
    ) {
      console.log("group: " + events[0].source.groupId);
      client.leaveGroup(events[0].source.groupId);
      return res.sendStatus(200);
    }

    // Check Group Leave
    if (events[0].type == "leave") {
      console.log("event: " + events);
      return res.sendStatus(200);
    }

    // Log Group Join
    if (
      events[0].type == "join" &&
      events[0].source.groupId == config.groupId
    ) {
      console.log("group: " + events[0].source.groupId);
      return res.sendStatus(200);
    }

    const eventType = events[0].type;
    const eventSource = events[0].source.type;
    const groupId = events[0].source.groupId;

    if (groupId == config.groupId) {
      // Upload Image & Message
      if (
        eventType == "message" &&
        events[0].message.type == "image" &&
        eventSource == "group"
      ) {
        const imageId = events[0].message.id;

        //Upload Image to S3

        await client.getMessageContent(imageId).then((stream) => {
          const imageChunks = [];

          stream.on("data", (chunk) => {
            imageChunks.push(chunk);
          });

          stream.on("error", (err) => {
            console.log(err);
          });

          stream.on("end", () => {
            const realImage = Buffer.concat(imageChunks);

            const uploadFile = (image) => {
              const params = {
                Bucket: BUCKET_NAME,
                Key: `${imageId}.jpg`,
                Body: image,
                ContentType: "image/jpeg",
                ACL: "public-read",
              };

              s3.upload(params, function (err /*, data*/) {
                if (err) {
                  console.log(err);
                }
                //console.log(data)
              });
            };

            uploadFile(realImage);
          });
        });

        //Upload Message to DynamoDB
        const messageId = events[0].message.id;
        const messageTextContent = events[0].message.text;
        const userId = events[0].source.userId;
        const messageType = events[0].message.type;
        const time = events[0].timestamp;
        const generateTTL = ((time / 1000) | 0) + 2592000;

        const uploadMessageToDynamoDB = async (messageDetails) => {
          const params = {
            TableName: TABLE_NAME,
            Item: messageDetails,
          };
          await dynamoDB.put(params).promise();
        };
        const messageDetailsToUpload = {
          message_id: messageId,
          message: messageTextContent,
          group_id: groupId,
          user_id: userId,
          type_of_message: messageType,
          create_at: time,
          ttl: generateTTL,
        };
        uploadMessageToDynamoDB(messageDetailsToUpload);
        res.sendStatus(200);
      }
      // Unsend Message & Unsend Image & Upload Message
      else {
        // Unsend
        if (eventType == "unsend") {
          const unsendMessageId = events[0].unsend.messageId;
          const time = events[0].timestamp;
          const deletedTimeOne = new Date(time);
          const deletedTimeTwo = moment(deletedTimeOne)
            .tz("Asia/Bangkok")
            .format("dddd DD/MM/YYYY, HH:mm น.");

          const getUnsendMessage = async (message_id) => {
            const params = {
              TableName: TABLE_NAME,
              Key: { message_id },
            };

            const unsendMessage = await dynamoDB
              .get(params)
              .promise()
              .then(async (responses) => {
                const unsendDetail = responses.Item;

                await client
                  .getProfile(unsendDetail.user_id)
                  .then((profile) => {
                    const userName = profile.displayName;
                    const createdTimeOne = new Date(unsendDetail.create_at);
                    const createdTimeTwo = moment(createdTimeOne)
                      .tz("Asia/Bangkok")
                      .format("dddd DD/MM/YYYY, HH:mm น.");

                    const changeDateLanguage = (dateEN) => {
                      if (dateEN.includes("Sunday")) {
                        const DateTH = dateEN.replace("Sunday", "วันอาทิตย์");
                        return DateTH;
                      } else if (dateEN.includes("Monday")) {
                        const DateTH = dateEN.replace("Monday", "วันจันทร์");
                        return DateTH;
                      } else if (dateEN.includes("Tuesday")) {
                        const DateTH = dateEN.replace("Tuesday", "วันอังคาร");
                        return DateTH;
                      } else if (dateEN.includes("Wednesday")) {
                        const DateTH = dateEN.replace("Wednesday", "วันพุธ");
                        return DateTH;
                      } else if (dateEN.includes("Thursday")) {
                        const DateTH = dateEN.replace(
                          "Thursday",
                          "วันพฤหัสบดี"
                        );
                        return DateTH;
                      } else if (dateEN.includes("Friday")) {
                        const DateTH = dateEN.replace("Friday", "วันศุกร์");
                        return DateTH;
                      } else if (dateEN.includes("Saturday")) {
                        const DateTH = dateEN.replace("Saturday", "วันเสาร์");
                        return DateTH;
                      }
                    };
                    const createdTimeThree = changeDateLanguage(createdTimeTwo);
                    const deletedTimeThree = changeDateLanguage(deletedTimeTwo);

                    // Unsend Message
                    if (unsendDetail.type_of_message == "text") {
                      const unsendType = "ข้อความ";

                      const message = {
                        type: "text",
                        text: `รายการยกเลิกข้อความ\n\nชื่อ: ${userName}\nประเภท: ${unsendType}\nข้อความ:\n${unsendDetail.message}\n\nส่งเมื่อ:\n${createdTimeThree}\nลบเมื่อ:\n${deletedTimeThree}`,
                      };
                      client.pushMessage(groupId, message);
                      res.sendStatus(200);
                    }

                    // Unsend Image-------------------------------------------------
                    else if (unsendDetail.type_of_message == "image") {
                      const imageName = `${unsendMessageId}.jpg`;
                      const unsendType = "รูปภาพ";
                      const message = [
                        {
                          type: "text",
                          text: `รายการยกเลิกข้อความ\n\nชื่อ: ${userName}\nประเภท: ${unsendType}\n\nส่งเมื่อ:\n${createdTimeThree}\nลบเมื่อ:\n${deletedTimeThree}`,
                        },
                        {
                          type: "image",
                          originalContentUrl: `https://umd-bot.s3-ap-southeast-1.amazonaws.com/${imageName}`,
                          previewImageUrl: `https://umd-bot.s3-ap-southeast-1.amazonaws.com/${imageName}`,
                        },
                      ];
                      client.pushMessage(groupId, message);
                      res.sendStatus(200);
                    } else {
                      //console.log(unsendDetail.type_of_message);
                      res.sendStatus(200);
                    }
                  });
              });
          };
          getUnsendMessage(unsendMessageId);
        }

        // Upload Message
        else if (eventType == "message") {
          const time = events[0].timestamp;
          const generateTTL = ((time / 1000) | 0) + 2592000;

          const messageDetailsToUpload = {
            message_id: events[0].message.id,
            message: events[0].message.text,
            group_id: groupId,
            user_id: events[0].source.userId,
            type_of_message: events[0].message.type,
            create_at: time,
            ttl: generateTTL,
          };

          const uploadMessageToDynamoDB = async (messageDetails) => {
            const params = {
              TableName: TABLE_NAME,
              Item: messageDetails,
            };
            await dynamoDB.put(params).promise();
            res.sendStatus(200);
          };

          uploadMessageToDynamoDB(messageDetailsToUpload);
        } else {
          console.log(events);
          res.sendStatus(200);
        }
      }
    }
  },
};

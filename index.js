require("./lib/system/config.js"), require("dotenv").config();
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const chalk = require("chalk");
const PORT = process.env.PORT || 8080;
const runServer = async () => {
  const app = express();
  app
    .set("json spaces", 2)
    .use(express.json())
    .use(require("morgan")("dev"))
    .use(
      bodyParser.json({
        limit: "50mb",
      })
    )
    .use(
      bodyParser.urlencoded({
        limit: "50mb",
        extended: true,
        parameterLimit: 50000,
      })
    )
    .use(
      express.urlencoded({
        extended: false,
      })
    )
    .use("/", await require("./handler"))
    .get("*", (req, res) =>
      res.json({
        status: false,
      })
    );
  app.disable("x-powered-by");
  app.listen(PORT, () => {
    const CFonts = require("cfonts");
    CFonts.say("Quote-API", {
      font: "tiny",
      align: "center",
      colors: ["system"],
    }),
      CFonts.say("Github : https://github.com/neoxr/quote-generator", {
        colors: ["system"],
        font: "console",
        align: "center",
      });
    console.log(chalk.yellowBright.bold("Server listening on port --->", PORT));
  });
};

runServer().catch(() => runServer());

const quoteApi = require("@neoxr/quote-api");
const fs = require("node:fs");

const text = "Hello World";
const username = "Alι_Aryαɴ";
// const avatar = "https://telegra.ph/file/59952c903fdfb10b752b3.jpg";

const json = {
  type: "quote",
  format: "png",
  backgroundColor: "#FFFFFF",
  width: 512,
  height: 768,
  scale: 2,
  messages: [
    {
      entities: [],
      avatar: false,
      from: {
        id: 1,
        name: username,
        //   photo: {
        //     url: avatar,
        //   },
      },
      text: text,
      replyMessage: {},
    },
  ],
};

quoteApi(json).then((res) => {
  const buffer = Buffer.from(res.image, "base64");
  fs.writeFile("Quotly.png", buffer, (err) => {
    if (err) throw err;
  });
});

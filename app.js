const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");
const app = express();

app.use(express.json());

let database = null;

const initializeDBandServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Database Error is ${error.message}`);
    process.exit(1);
  }
};

initializeDBandServer();

/* API:1 Register User */
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const getUserQuery = `SELECT username FROM user WHERE username = '${username}';`;
  const checkUser = await database.get(getUserQuery);

  if (checkUser === undefined) {
    if (password.length > 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
            INSERT INTO
                user(username, password, name, gender)
            VALUES(
                '${username}', '${hashedPassword}', '${name}', '${gender}'
            );`;
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

/* API:2 Login User */
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const checkUser = await database.get(getUserQuery);

  if (checkUser !== undefined) {
    const checkPassword = await bcrypt.compare(password, checkUser.password);

    if (checkPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "My_Secret_Token");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

/* Middleware Function  - AUTHENTICATION*/
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Secret_Token", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

/* API:3 GET User tweets */
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${request.username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const getUserTweets = `
        SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
        FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
        WHERE user.user_id IN (
            SELECT following_user_id 
            FROM follower 
            WHERE follower_user_id = ${getUserId.user_id})
        ORDER BY tweet.date_time DESC LIMIT 4;`;
  const userTweets = await database.all(getUserTweets);
  response.send(userTweets);
});

/* API:4 GET User Following */
app.get("/user/following/", authenticateToken, async (request, response) => {
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${request.username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const getUserFollowingQuery = `
        SELECT name FROM user
        WHERE user_id IN (
            SELECT following_user_id
            FROM follower 
            WHERE follower_user_id = ${getUserId.user_id}
            );`;
  const userFollowing = await database.all(getUserFollowingQuery);
  response.send(userFollowing);
});

/* API:5 GET User Followers */
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${request.username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const getFollowersQuery = `
        SELECT name FROM user
        WHERE user_id IN (
            SELECT follower_user_id
            FROM follower
            WHERE following_user_id = ${getUserId.user_id}
        );`;
  const followers = await database.all(getFollowersQuery);
  response.send(followers);
});

/* API:6 GET Tweets with TweetId */
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;

  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${request.username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const getTweetIdsQuery = `
        SELECT tweet_id
        FROM tweet 
        WHERE user_id IN (
            SELECT following_user_id
            FROM follower
            WHERE follower_user_id = ${getUserId.user_id}
        );`;
  const getTweetIds = await database.all(getTweetIdsQuery); // Returns array of TweetIds from database

  const tweetIds = getTweetIds.map((eachId) => eachId.tweet_id); //Grouping tweetIds in an array

  if (tweetIds.includes(parseInt(tweetId))) {
    const getTweetQuery = `
        SELECT tweet.tweet, 
                (SELECT COUNT(like.user_id) FROM like WHERE tweet_id = ${tweetId}) AS likes,
                (SELECT COUNT(reply.user_id) FROM reply WHERE tweet_id = ${tweetId}) AS replies,
                tweet.date_time AS dateTime
        FROM tweet
        WHERE tweet_id = ${tweetId};`;
    const getTweet = await database.get(getTweetQuery);
    response.send(getTweet);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

/*API:7 GET tweet LIKES*/
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${request.username}';`;
    const getUserId = await database.get(getUserIdQuery);

    const getTweetIdsQuery = `
        SELECT tweet_id
        FROM tweet 
        WHERE user_id IN (
            SELECT following_user_id
            FROM follower
            WHERE follower_user_id = ${getUserId.user_id}
        );`;
    const getTweetIds = await database.all(getTweetIdsQuery); // Returns array of TweetIds from database

    const tweetIds = getTweetIds.map((eachId) => parseInt(eachId.tweet_id)); //Grouping tweetIds in an array

    if (tweetIds.includes(parseInt(tweetId))) {
      const getUsernamesQuery = `
        SELECT user.username
        FROM user 
            INNER JOIN like ON user.user_id = like.user_id
        WHERE like.tweet_id = ${tweetId}
        ;`;
      const getUsernames = await database.all(getUsernamesQuery);
      const likes = getUsernames.map((eachUser) => eachUser.username);

      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

/*API:8 GET tweet Replies*/
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${request.username}';`;
    const getUserId = await database.get(getUserIdQuery);

    const getTweetIdsQuery = `
        SELECT tweet_id
        FROM tweet 
        WHERE user_id IN (
            SELECT following_user_id
            FROM follower
            WHERE follower_user_id = ${getUserId.user_id}
        );`;
    const getTweetIds = await database.all(getTweetIdsQuery); // Returns array of TweetIds from database

    const tweetIds = getTweetIds.map((eachId) => parseInt(eachId.tweet_id)); //Grouping tweetIds in an array

    if (tweetIds.includes(parseInt(tweetId))) {
      const getUserRepliesQuery = `
        SELECT user.name, reply.reply
        FROM user 
            INNER JOIN reply ON user.user_id = reply.user_id
        WHERE reply.tweet_id = ${tweetId}
        ;`;
      const replies = await database.all(getUserRepliesQuery);

      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

/* API:9 GET Tweets of the User */
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  // Get user_id
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${request.username}';`;
  const getUserId = await database.get(getUserIdQuery);

  //GET tweet_ids
  const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${getUserId.user_id};`;
  const getTweetIds = await database.all(getTweetIdsQuery);
  const tweetIds = getTweetIds.map((eachId) => eachId.tweet_id);

  //GET tweets
  const query = `SELECT  tweet, date_time  FROM tweet  WHERE tweet.user_id = ${getUserId.user_id};`;
  const getTweets = await database.all(query);
  //GET likes
  const likesQuery = `SELECT COUNT(user_id) AS likes  FROM like  WHERE like.tweet_id IN (${tweetIds})  GROUP BY like.tweet_id;`;
  const getLikes = await database.all(likesQuery);
  //GET replies
  const repliesQuery = `SELECT COUNT(user_id) AS replies  FROM reply  WHERE reply.tweet_id IN (${tweetIds})  GROUP BY reply.tweet_id;`;
  const getReplies = await database.all(repliesQuery);

  const resultArray = [];

  for (let i = 0; i < getTweets.length; i++) {
    resultArray.push({
      tweet: getTweets[i].tweet,
      likes: getLikes[i].likes,
      replies: getReplies[i].replies,
      dateTime: getTweets[i].date_time,
    });
  }

  response.send(resultArray);
});

/* API:10 POST tweet*/
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${request.username}';`;
  const getUserId = await database.get(getUserIdQuery);

  const { tweet } = request.body;
  const currentDate = new Date().toISOString().replace("T", " ");

  const postTweet = `
        INSERT INTO
        tweet(tweet, user_id, date_time)
        VALUES( '${tweet}', ${getUserId.user_id}, '${currentDate}' );`;
  await database.run(postTweet);
  response.send("Created a Tweet");
});

/*API:11 DELETE Tweet*/
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;

    const getTweetIdsQuery = `
        SELECT tweet_id 
        FROM tweet
        WHERE user_id = (SELECT user_id FROM user WHERE username = '${request.username}');`;
    const getTweetIds = await database.all(getTweetIdsQuery);

    const userTweetIds = getTweetIds.map((eachId) => eachId.tweet_id);

    if (userTweetIds.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet.tweet_id = ${tweetId};`;
      await database.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/tweets/", async (request, response) => {
  const query = `SELECT * FROM reply;`;
  const tweets = await database.all(query);
  response.send(tweets);
});

module.exports = app;

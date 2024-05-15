import sha1 from 'sha1';
import { ObjectID } from 'mongodb';
import Queue from 'bull/lib/queue';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const userQueue = new Queue('userQueue', 'redis://127.0.0.1:6379');

class UsersController {
  static postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Missing email' });
      return;
    }
    if (!password) {
      res.status(400).json({ error: 'Missing password' });
      return;
    }

    const users = dbClient.db.collection('users');
    users.findOne({ email }, (err, user) => {
      if (user) {
        res.status(400).json({ error: 'Already exists' });
      } else {
        const hashedPwd = sha1(password);
        users.insertOne(
          {
            email,
            password: hashedPwd,
          },
        ).then((result) => {
          res.status(201).json({ id: result.insertedId, email });
          userQueue.add({ userId: result.insertedId });
        }).catch((error) => console.log(error));
      }
    });
  }

  static async getMe(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (userId) {
      const users = dbClient.db.collection('users');
      const objId = new ObjectID(userId);
      users.findOne({ _id: objId }, (err, user) => {
        if (user) {
          res.status(200).json({ id: userId, email: user.email });
        } else {
          res.status(400).json({ error: 'Unauthorized' });
        }
      });
    } else {
      console.log('Hupatikani!');
      res.status(401).json({ error: 'Unauthorized' });
    }
  }
}

module.exports = UsersController;

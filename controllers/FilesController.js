import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  constructor() {
    const { FOLDER_PATH = '/tmp/files_manager' } = process.env;
    this.FOLDER_PATH = FOLDER_PATH;
  }

  async postUpload(req, res) {
    const tokenHeader = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${tokenHeader}`);
    const user = await dbClient.db
      .collection('users')
      .findOne({ _id: new ObjectId(userId) });
    if (!user) return res.status(401).send({ error: 'Unauthorized' });
    const {
      name, type, parentId, isPublic, data,
    } = req.body;
    const acceptedTypes = ['folder', 'file', 'image'];
    if (!name) return res.status(401).send({ error: 'Missing name' });
    if (!type || !acceptedTypes.includes(type)) return res.status(401).send({ error: 'Missing type' });
    if (!data && type !== acceptedTypes[0]) return res.status(401).send({ error: 'Missing data' });
    if (parentId) {
      const parent = await dbClient.db
        .collection('files')
        .findOne({ _id: new ObjectId(parentId) });
      if (!parent) return res.status(401).send({ error: 'Parent not found' });
      if (parent.type !== acceptedTypes[0]) {
        return res
          .status(401)
          .send({ error: 'Parent is not a folder' });
      }
      if (parent.userId !== user._id.toString()) return res.status(401).send({ error: 'Unauthorized' });
    }
    if (type === acceptedTypes[0]) {
      const newFolder = await dbClient.db.collection('files').insertOne({
        name,
        type,
        parentId: parentId || 0,
        isPublic: isPublic || false,
        userId: user._id.toString(),
      });
      return res.status(201).send(newFolder.ops[0]);
    }
    const path = `${this.FOLDER_PATH}/${uuidv4()}`;
    /* eslint-disable no-undef */
    // const decodedData = atob(data);
    const decodedData = Buffer.from(data, 'base64');
    /* eslint-disable no-undef */
    fs.mkdirSync(this.FOLDER_PATH, { recursive: true });
    await fs.writeFileSync(path, decodedData);
    const newFile = await dbClient.db.collection('files').insertOne({
      name,
      type,
      isPublic: isPublic || false,
      parentId: parentId || 0,
      localPath: path,
      userId: user._id.toString(),
    });
    return res.status(201).send(newFile.ops[0]);
  }
}

module.exports = FilesController;

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

  static async postUpload(req, res) {
    const tokenHeader = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${tokenHeader}`);
    const user = await dbClient.db
      .collection('users')
      .findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(401).send({ error: 'Unauthorized' });
    }
    const {
      name, type, parentId, isPublic, data,
    } = req.body;
    const acceptedTypes = ['folder', 'file', 'image'];
    if (!name) {
      return res.status(401).send({ error: 'Missing name' });
    }
    if (!type || !acceptedTypes.includes(type)) {
      return res.status(401).send({ error: 'Missing type' });
    }
    if (!data && type !== acceptedTypes[0]) {
      return res.status(401).send({ error: 'Missing data' });
    }
    if (parentId) {
      const parent = await dbClient.db
        .collection('files')
        .findOne({ _id: new ObjectId(parentId) });
      if (!parent) {
        return res.status(401).send({ error: 'Parent not found' });
      }
      if (parent.type !== acceptedTypes[0]) {
        return res
          .status(401)
          .send({ error: 'Parent is not a folder' });
      }
      if (parent.userId !== user._id.toString()) {
        return res.status(401).send({ error: 'Unauthorized' });
      }
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

  static async getShow(req, res) {
    const tokenHeader = req.header['x-token'];
    const userId = await redisClient.get(`auth_${tokenHeader}`);
    const user = await dbClient.db
      .collection('users')
      .findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(401).send({ error: 'Unauthorized' });
    }
    const { id } = req.params;
    const file = await dbClient.db
      .collection('files')
      .findOne({ _id: new ObjectId(id) });

    if (!file || (file && file.userId !== user._id.toString())) {
      return res.status(404).send({ error: 'Not found' });
    }
    return res.status(200).send(file);
  }

  static async getIndex(req, res) {
    const tokenHeader = req.header['x-token'];
    const userId = await redisClient.get(`auth_${tokenHeader}`);
    const user = await dbClient.db
      .collection('users')
      .findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return res.status(401).send({ error: 'Unauthorized' });
    }
    const { parentId, page = 0 } = req.query;
    const limit = 20;
    const skip = page * limit;

    const files = await dbClient.db
      .collection('files')
      .aggregate([
        { $match: { parentId } },
        { $skip: skip },
        { $limit: limit },
      ])
      .toArray();
    return res.status(200).send(files);
  }
  static async putPublish(request, response) {
    const { error, code, updatedFile } = await fileUtils.publishUnpublish(
      request,
      true,
    );

    if (error) return response.status(code).send({ error });

    return response.status(code).send(updatedFile);
  }
  static async putUnpublish(request, response) {
    const { error, code, updatedFile } = await fileUtils.publishUnpublish(
      request,
      false,
    );

    if (error) return response.status(code).send({ error });

    return response.status(code).send(updatedFile);
  }
  static async getFile(request, response) {
    const { userId } = await userUtils.getUserIdAndKey(request);
    const { id: fileId } = request.params;
    const size = request.query.size || 0;

    // Mongo Condition for Id
    if (!basicUtils.isValidId(fileId)) { return response.status(404).send({ error: 'Not found' }); }

    const file = await fileUtils.getFile({
      _id: ObjectId(fileId),
    });

    if (!file || !fileUtils.isOwnerAndPublic(file, userId)) { return response.status(404).send({ error: 'Not found' }); }

    if (file.type === 'folder') {
      return response
        .status(400)
        .send({ error: "A folder doesn't have content" });
    }

    const { error, code, data } = await fileUtils.getFileData(file, size);

    if (error) return response.status(code).send({ error });

    const mimeType = mime.contentType(file.name);

    response.setHeader('Content-Type', mimeType);

    return response.status(200).send(data);
  }

}

module.exports = FilesController;

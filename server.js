const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { log } = require('console');

const app = express();
const upload = multer({ dest: 'uploads/' });

const s3 = new AWS.S3({
  accessKeyId: 'AKIARTSTZTY5ADAPTSZS',
  secretAccessKey: 'KetLAo5c7SPL1jbLZrdlMIJx/nN6ZnLXWZUTrIa6',
  region: 'ap-northeast-1' // Replace with your AWS region
});

const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);

app.use(express.static('public'));

// Endpoint for uploading videos
app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send('No file uploaded.');
  }

  const filename = path.parse(file.originalname).name;
  const outputDir = path.join(__dirname, 'outputs', filename);
  const inputFilePath = path.join(__dirname, file.path);

  fs.mkdirSync(outputDir, { recursive: true });

  try {
    await segmentVideo(inputFilePath, outputDir, filename);
    await uploadDirectoryToS3(outputDir, filename);
    res.send('Upload and processing completed successfully!');
  } catch (error) {
    console.error('Error processing video:', error);
    res.status(500).send('Error processing video.');
  } finally {
    cleanupFiles([inputFilePath, outputDir]);
  }
});

const segmentVideo = (inputFilePath, outputDir, filename) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFilePath)
      .outputOptions([
        '-codec:v libx264',
        '-codec:a aac',
        '-hls_time 10',
        '-hls_playlist_type vod',
        `-hls_segment_filename ${outputDir}/segment%03d.ts`,
        '-start_number 0'
      ])
      .output(`${outputDir}/index.m3u8`)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
};

const uploadDirectoryToS3 = async (dir, baseKey) => {
  const files = await readdir(dir);

  const uploadPromises = files.map(async (file) => {
    const filePath = path.join(dir, file);
    const fileContent = await readFile(filePath);

    const params = {
      Bucket: 'hls.karthikshetty.dev',
      Key: `${baseKey}/${file}`,
      Body: fileContent
    };

    return s3.upload(params).promise();
  });

  await Promise.all(uploadPromises);
};

const cleanupFiles = (paths) => {
  paths.forEach((path) => {
    fs.rmSync(path, { recursive: true, force: true });
  });
};

app.listen(3000, () => {
  console.log('Server is listening on port 3000');
});

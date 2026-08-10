import express from 'express';

import Router from 'express-promise-router';
import {
  LoggerService,
} from '@backstage/backend-plugin-api';

import {
  runJob,
} from './job-service';

import {
  getJobStatus,
  getActiveJob,
} from './job-status';

import {
  addClient,
  removeClient,
} from './job-events';

import {
  addLogClient,
  removeLogClient,
  streamMakeDocLogs,
} from './job-logs';


export interface RouterOptions {
  logger: LoggerService;
}



export async function createRouter(
  options: RouterOptions,
): Promise<any> {

  const {
    logger,
  } = options;



  const router = Router();


  router.use(
    express.json(),
  );



  router.use(
    (req, res, next) => {

      res.setHeader(
        'Access-Control-Allow-Origin',
        '*',
      );

      res.setHeader(
        'Access-Control-Allow-Methods',
        'POST, GET, OPTIONS, PUT, DELETE',
      );

      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization',
      );


      if (
        req.method === 'OPTIONS'
      ) {
        res.sendStatus(200);
        return;
      }


      next();
    },
  );



  router.post(
    '/run-job',
    async (req, res) => {

      try {

        logger.info(
          'Creating MakeDoc Kubernetes Job',
        );


        const result =
          await runJob(
            req.body,
          );


        logger.info(
          `Created MakeDoc Job: ${result.jobName}`,
        );


        res.status(200).json(
          result,
        );


      } catch (error: any) {

        logger.error(
          `Failed creating MakeDoc Job: ${
            error?.message ?? error
          }`,
        );


        if (!res.headersSent) {

          const message =
            error?.message ??
            'Unable to create MakeDoc Job';


          const statusCode =
            message.startsWith('Invalid')
              ? 400
              : 500;


          res.status(statusCode).json({
            error: message,
          });

        }

      }

    },
  );



  router.get(
    '/events',
    (req, res) => {

      res.setHeader(
        'Content-Type',
        'text/event-stream',
      );

      res.setHeader(
        'Cache-Control',
        'no-cache',
      );

      res.setHeader(
        'Connection',
        'keep-alive',
      );


      res.flushHeaders();


      addClient(
        res,
      );


      req.on(
        'close',
        () => {

          removeClient(
            res,
          );

        },
      );

    },
  );



  router.get(
    '/active-job',
    async (_req, res) => {

      try {

        const result =
          await getActiveJob();


        res.json(
          result,
        );


      } catch (error: any) {

        logger.error(
          `Failed getting active job: ${
            error?.message ?? error
          }`,
        );


        res.status(500).json({
          error:
            error?.message ??
            'Unable to get active job',
        });

      }

    },
  );



  router.get(
    '/job-status/:jobName',
    async (req, res) => {

      const {
        jobName,
      } = req.params;


      try {

        const result =
          await getJobStatus(
            jobName,
          );


        res.json(
          result,
        );


      } catch (error: any) {

        logger.error(
          `Failed getting job status: ${
            error?.message ?? error
          }`,
        );


        res.status(500).json({
          error:
            error?.message ??
            'Unable to get job status',
        });

      }

    },
  );


    router.get(
    '/job-logs/:jobName',
    async (req, res) => {

      const {
        jobName,
      } = req.params;


      logger.info(
        `Opening log stream for job ${jobName}`,
      );

      try {

        const jobStatus =
          await getJobStatus(
            jobName,
          );

          logger.info(
            `Found pod: ${jobStatus.podName}`,
          );

        if (
          !jobStatus.podName
        ) {

          res.status(404).json({
            error:
              'Pod not found',
          });

          return;

        }



        res.setHeader(
          'Content-Type',
          'text/event-stream',
        );

        res.setHeader(
          'Cache-Control',
          'no-cache',
        );

        res.setHeader(
          'Connection',
          'keep-alive',
        );


        res.flushHeaders();



        addLogClient(
          jobName,
          res,
        );



        req.on(
          'close',
          () => {

            removeLogClient(
              jobName,
              res,
            );

          },
        );



        await streamMakeDocLogs(
          jobName,
          jobStatus.podName,
        );



      } catch (error: any) {


        logger.error(
          `Failed streaming logs: ${
            error?.message ?? error
          }`,
        );


        if (!res.headersSent) {

          res.status(500).json({
            error:
              error?.message ??
              'Unable to stream logs',
          });

        }

      }

    },
  );

  return router;
}
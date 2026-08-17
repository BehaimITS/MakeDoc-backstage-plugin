 // provides the HTTP API for starting MakeDoc jobs and monitoring their progress
 // job status is available through regular HTTP endpoints and a dedicated SSE connection
 // job logs are streamed through a separate SSE connection and previously collected logs are replayed
 // the router also provides endpoints for checking the active job and retrieving the latest job


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
  getLatestJob,
} from './job-events';

import {
  addLogClient,
  removeLogClient,
  startMakeDocLogCollection,
} from './job-logs';

// defines the dependencies required to create the router
export interface RouterOptions {

  logger: LoggerService;

}

// creates the backend API routes used by the MakeDoc plugin
export async function createRouter(
  options: RouterOptions,
): Promise<any> {

  const {
    logger,
  } = options;

  const router =
    Router();

  // parses incoming request bodies as JSON
  router.use(
    express.json(),
  );

  // configures CORS headers and handles preflight requests
  router.use(
    (
      req,
      res,
      next,
    ) => {

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

        res.sendStatus(
          200,
        );

        return;

      }

      next();

    },
  );

  // creates a new MakeDoc Kubernetes Job from the request data
  router.post(
    '/run-job',
    async (
      req,
      res,
    ) => {

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

        res
          .status(200)
          .json(
            result,
          );

      } catch (
        error: any
      ) {

        logger.error(
          `Failed creating MakeDoc Job: ${
            error?.message ?? error
          }`,
        );

        if (
          !res.headersSent
        ) {

          const message =
            error?.message ??
            'Unable to create MakeDoc Job';

          const statusCode =
            message.startsWith(
              'Invalid',
            )
              ? 400
              : 500;

          res
            .status(statusCode)
            .json({

              error:
                message,

            });

        }

      }

    },
  );

  // opens an SSE connection for receiving job status updates
  router.get(
    '/events',
    (
      req,
      res,
    ) => {

      res.setHeader(
        'Content-Type',
        'text/event-stream',
      );

      res.setHeader(
        'Cache-Control',
        'no-cache, no-transform',
      );

      res.setHeader(
        'Connection',
        'keep-alive',
      );

      // prevents reverse proxies from buffering SSE responses
      res.setHeader(
        'X-Accel-Buffering',
        'no',
      );

      res.flushHeaders();

      addClient(
        res,
      );

      // removes the client when the SSE connection closes
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

  // returns the most recently created job even after it has finished
  router.get(
    '/latest-job',
    (
      _req,
      res,
    ) => {

      try {

        const result =
          getLatestJob();

        res.json(
          result,
        );

      } catch (
        error: any
      ) {

        logger.error(
          `Failed getting latest MakeDoc job: ${
            error?.message ?? error
          }`,
        );

        res
          .status(500)
          .json({

            error:
              error?.message ??
              'Unable to get latest MakeDoc job',

          });

      }

    },
  );

  // returns whether a MakeDoc job is currently active
  router.get(
    '/active-job',
    async (
      _req,
      res,
    ) => {

      try {

        const result =
          await getActiveJob();

        res.json(
          result,
        );

      } catch (
        error: any
      ) {

        logger.error(
          `Failed getting active job: ${
            error?.message ?? error
          }`,
        );

        res
          .status(500)
          .json({

            error:
              error?.message ??
              'Unable to get active job',

          });

      }

    },
  );

  // returns the current status of a specific job
  router.get(
    '/job-status/:jobName',
    async (
      req,
      res,
    ) => {

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

      } catch (
        error: any
      ) {

        logger.error(
          `Failed getting job status: ${
            error?.message ?? error
          }`,
        );

        res
          .status(500)
          .json({

            error:
              error?.message ??
              'Unable to get job status',

          });

      }

    },
  );

  // opens an SSE connection for replaying and receiving job logs
  router.get(
    '/job-logs/:jobName',
    (
      req,
      res,
    ) => {

      const {
        jobName,
      } = req.params;

      logger.info(
        `Opening log stream for job ${jobName}`,
      );

      try {

        res.setHeader(
          'Content-Type',
          'text/event-stream',
        );

        res.setHeader(
          'Cache-Control',
          'no-cache, no-transform',
        );

        res.setHeader(
          'Connection',
          'keep-alive',
        );

        // prevents reverse proxies from buffering the SSE response
        res.setHeader(
          'X-Accel-Buffering',
          'no',
        );

        res.flushHeaders();

        // keeps the connection active before the first log message arrives
        res.write(
          ': connected\n\n',
        );

        // replays stored logs and registers the client for new logs
        addLogClient(
          jobName,
          res,
        );

        // removes the client when the log connection closes
        req.on(
          'close',
          () => {

            removeLogClient(
              jobName,
              res,
            );

          },
        );

        // starts collection if the job does not already have a collector
        startMakeDocLogCollection(
          jobName,
        );

      } catch (
        error: any
      ) {

        logger.error(
          `Failed opening logs: ${
            error?.message ?? error
          }`,
        );

        if (
          !res.headersSent
        ) {

          res
            .status(500)
            .json({

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
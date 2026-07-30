import * as k8s from '@kubernetes/client-node';

export const getJobTemplate = (
  jobName: string,
  namespace: string,
  repoUrl: string,
  inputDir: string,
  outputDir: string,
  secretName: string,
): k8s.V1Job => {
  return {
    apiVersion: 'batch/v1',
    kind: 'Job',

    metadata: {
      name: jobName,
      namespace,
      labels: {
        'makedoc-pipeline-id': jobName,
        app: 'makedoc',
      },
    },

    spec: {
      ttlSecondsAfterFinished: 60,
      backoffLimit: 0,

      template: {
        metadata: {
          labels: {
            'job-name': jobName,
            app: 'makedoc',
          },
        },

        spec: {
          restartPolicy: 'Never',

          serviceAccountName: 'makedoc-runner',

          volumes: [
            {
              name: 'shared-workspace',
              emptyDir: {},
            },
          ],

          initContainers: [
            {
              name: 'step1-git-clone',

              image: 'alpine/git:latest',

              env: [
                {
                  name: 'GIT_TOKEN',
                  valueFrom: {
                    secretKeyRef: {
                      name: secretName,
                      key: 'GIT_TOKEN',
                    },
                  },
                },
                {
                  name: 'REPO_URL',
                  value: repoUrl,
                },
                {
                  name: 'INPUT_DIR',
                  value: inputDir,
                },
              ],

              command: [
                '/bin/sh',
                '-c',
              ],

              args: [
                `
                set -e

                git clone "https://oauth2:\${GIT_TOKEN}@\${REPO_URL}" /workspace

                mkdir -p /workspace/projects-mount
                mkdir -p /workspace/storage-mount

                if [ -d "/workspace/\${INPUT_DIR}" ]; then
                cp -r "/workspace/\${INPUT_DIR}/." /workspace/projects-mount/ 2>/dev/null || true
                fi

                chmod -R 777 /workspace

                unset GIT_TOKEN
                `,
              ],

              volumeMounts: [
                {
                  name: 'shared-workspace',
                  mountPath: '/workspace',
                },
              ],
            },
          ],

          containers: [
            {
              name: 'step2-makedoc-engine',

              image: 'behaimits/makedoc:latest',

              imagePullPolicy: 'Always',

              env: [],

              volumeMounts: [
                {
                  name: 'shared-workspace',
                  mountPath:
                    '/home/makedoc/projects',
                  subPath: 'projects-mount',
                },
                {
                  name: 'shared-workspace',
                  mountPath:
                    '/home/makedoc/server/storage/default',
                  subPath: 'storage-mount',
                },
              ],
            },

            {
              name: 'step3-git-push-finalizer',

              image: 'bitnami/kubectl:latest',

              command: [
                '/bin/sh',
                '-c',
              ],

              env: [
                {
                  name: 'OUTPUT_DIR',
                  value: outputDir,
                },
                {
                  name: 'JOB_NAME',
                  value: jobName,
                },
              ],

              args: [
                `
                sleep 5

                until [ "$(kubectl get pod \
                -l job-name=\${JOB_NAME} \
                -o jsonpath='{.items[0].status.containerStatuses[?(@.name=="step2-makedoc-engine")].state.terminated}')" != "" ];
                do
                sleep 5
                done

                cd /workspace

                mkdir -p "/workspace/\${OUTPUT_DIR}"

                if [ -d "/workspace/storage-mount" ]; then
                cp -r /workspace/storage-mount/. "/workspace/\${OUTPUT_DIR}/" 2>/dev/null || true
                fi

                find "/workspace/\${OUTPUT_DIR}" \
                -maxdepth 1 \
                -mindepth 1 \
                | while read item; do

                itemName=$(basename "$item")

                if ! echo "$itemName" | grep -Eq '^[0-9]{13}$'; then
                    rm -rf "$item"
                fi

                done


                export GIT_CONFIG_GLOBAL=/workspace/.gitconfig

                git config --global --add safe.directory /workspace

                git config --global user.email "devhub-automation@example.com"

                git config --global user.name "Developer Hub Automation"


                git add "\${OUTPUT_DIR}"

                if ! git diff-index --quiet HEAD --; then

                git commit \
                    -m "MakeDoc DeveloperHub plugin auto commit"

                git push origin main

                fi
                `,
              ],

              volumeMounts: [
                {
                  name: 'shared-workspace',
                  mountPath: '/workspace',
                },
              ],
            },
          ],
        },
      },
    },
  };
};














// import * as k8s from '@kubernetes/client-node';

// export const getJobTemplate = (
//   jobName: string,
//   namespace: string,
//   repoUrl: string,
//   inputDir: string,
//   outputDir: string,
//   workspaceDir: string,
//   secretName: string,
// ): k8s.V1Job => {
//   return {
//     apiVersion: 'batch/v1',
//     kind: 'Job',

//     metadata: {
//       name: jobName,
//       namespace,
//       labels: {
//         'makedoc-pipeline-id': jobName,
//         app: 'makedoc',
//       },
//     },

//     spec: {
//       ttlSecondsAfterFinished: 60,
//       backoffLimit: 0,

//       template: {
//         metadata: {
//           labels: {
//             'job-name': jobName,
//             app: 'makedoc',
//           },
//         },

//         spec: {
//           restartPolicy: 'Never',

//           serviceAccountName: 'makedoc-runner',

//           volumes: [
//             {
//               name: 'shared-workspace',
//               emptyDir: {},
//             },
//           ],

//           initContainers: [
//             {
//               name: 'step1-git-clone',

//               image: 'alpine/git:latest',

//               env: [
//                 {
//                   name: 'GIT_TOKEN',
//                   valueFrom: {
//                     secretKeyRef: {
//                       name: secretName,
//                       key: 'GIT_TOKEN',
//                     },
//                   },
//                 },
//                 {
//                   name: 'REPO_URL',
//                   value: repoUrl,
//                 },
//                 {
//                   name: 'INPUT_DIR',
//                   value: inputDir,
//                 },
//                 {
//                   name: 'WORKSPACE_DIR',
//                   value: workspaceDir || '',
//                 },
//               ],

//               command: [
//                 '/bin/sh',
//                 '-c',
//               ],

//               args: [
//                 `
//                 set -e

//                 git clone "https://oauth2:\${GIT_TOKEN}@\${REPO_URL}" /workspace

//                 mkdir -p /workspace/projects-mount
//                 mkdir -p /workspace/storage-mount
//                 mkdir -p /workspace/customworkspace-mount

//                 if [ -d "/workspace/\${INPUT_DIR}" ]; then
//                 cp -r "/workspace/\${INPUT_DIR}/." /workspace/projects-mount/ 2>/dev/null || true
//                 fi

//                 if [ -n "\${WORKSPACE_DIR}" ] && [ -d "/workspace/\${WORKSPACE_DIR}" ]; then
//                 cp -r "/workspace/\${WORKSPACE_DIR}/." /workspace/customworkspace-mount/ 2>/dev/null || true
//                 fi

//                 chmod -R 777 /workspace

//                 unset GIT_TOKEN
//                 `,
//               ],

//               volumeMounts: [
//                 {
//                   name: 'shared-workspace',
//                   mountPath: '/workspace',
//                 },
//               ],
//             },
//           ],

//           containers: [
//             {
//               name: 'step2-makedoc-engine',

//               image: 'behaimits/makedoc:latest',

//               imagePullPolicy: 'Always',

//               env: [],

//               volumeMounts: [
//                 {
//                   name: 'shared-workspace',
//                   mountPath:
//                     '/home/makedoc/projects',
//                   subPath: 'projects-mount',
//                 },
//                 {
//                   name: 'shared-workspace',
//                   mountPath:
//                     '/home/makedoc/server/storage/default',
//                   subPath: 'storage-mount',
//                 },
//                 {
//                   name: 'shared-workspace',
//                   mountPath:
//                     '/home/makedoc/server/ws/customworkspace',
//                   subPath: 'customworkspace-mount',
//                 },
//               ],
//             },

//             {
//               name: 'step3-git-push-finalizer',

//               image: 'bitnami/kubectl:latest',

//               command: [
//                 '/bin/sh',
//                 '-c',
//               ],

//               env: [
//                 {
//                   name: 'OUTPUT_DIR',
//                   value: outputDir,
//                 },
//                 {
//                   name: 'JOB_NAME',
//                   value: jobName,
//                 },
//               ],

//               args: [
//                 `
//                 sleep 5

//                 until [ "$(kubectl get pod \
//                 -l job-name=\${JOB_NAME} \
//                 -o jsonpath='{.items[0].status.containerStatuses[?(@.name=="step2-makedoc-engine")].state.terminated}')" != "" ];
//                 do
//                 sleep 3
//                 done

//                 cd /workspace

//                 mkdir -p "/workspace/\${OUTPUT_DIR}"

//                 if [ -d "/workspace/storage-mount" ]; then
//                 cp -r /workspace/storage-mount/. "/workspace/\${OUTPUT_DIR}/" 2>/dev/null || true
//                 fi

//                 find "/workspace/\${OUTPUT_DIR}" \
//                 -maxdepth 1 \
//                 -mindepth 1 \
//                 | while read item; do

//                 itemName=$(basename "$item")

//                 if ! echo "$itemName" | grep -Eq '^[0-9]{13}$'; then
//                     rm -rf "$item"
//                 fi

//                 done


//                 export GIT_CONFIG_GLOBAL=/workspace/.gitconfig

//                 git config --global --add safe.directory /workspace

//                 git config --global user.email "devhub-automation@example.com"

//                 git config --global user.name "Developer Hub Automation"


//                 git add "\${OUTPUT_DIR}"

//                 if ! git diff-index --quiet HEAD --; then

//                 git commit \
//                     -m "MakeDoc DeveloperHub plugin auto commit"

//                 git push origin main

//                 fi
//                 `,
//               ],

//               volumeMounts: [
//                 {
//                   name: 'shared-workspace',
//                   mountPath: '/workspace',
//                 },
//               ],
//             },
//           ],
//         },
//       },
//     },
//   };
// };


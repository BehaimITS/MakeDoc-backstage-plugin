import {
  RunJobRequest,
} from './types';



export function validateRequest(
  body: RunJobRequest,
): void {

  const {
    repoUrl,
    accessToken,
    inputDir,
    outputDir,
    workspace,
    profile,
    filter,
    selections,
  } = body;



  if (
    !repoUrl ||
    typeof repoUrl !== 'string'
  ) {

    throw new Error(
      'Invalid repository URL',
    );

  }



  if (
    !accessToken ||
    typeof accessToken !== 'string'
  ) {

    throw new Error(
      'Invalid git access token',
    );

  }



  if (
    !inputDir ||
    typeof inputDir !== 'string'
  ) {

    throw new Error(
      'Invalid input directory',
    );

  }



  if (
    !outputDir ||
    typeof outputDir !== 'string'
  ) {

    throw new Error(
      'Invalid output directory',
    );

  }



  if (
    workspace !== undefined &&
    typeof workspace !== 'string'
  ) {

    throw new Error(
      'Invalid workspace',
    );

  }



  if (
    profile !== undefined &&
    typeof profile !== 'string'
  ) {

    throw new Error(
      'Invalid profile',
    );

  }



  if (
    filter !== undefined &&
    typeof filter !== 'string'
  ) {

    throw new Error(
      'Invalid filter',
    );

  }



  if (
    workspace &&
    !profile &&
    !filter
  ) {

    throw new Error(
      'Workspace requires either profile or filter',
    );

  }



  if (selections !== undefined) {

    if (
      typeof selections !== 'object' ||
      selections === null ||
      Array.isArray(selections)
    ) {

      throw new Error(
        'Invalid selections format',
      );

    }



    (
      [
        'bw5',
        'bw6',
        'ems',
      ] as const
    ).forEach(productKey => {

      const productSelections =
        selections[productKey];



      if (
        productSelections === undefined ||
        productSelections === null
      ) {

        return;

      }



      if (
        typeof productSelections !== 'object' ||
        Array.isArray(productSelections)
      ) {

        throw new Error(
          `Invalid selections.${productKey} format`,
        );

      }



      Object.entries(productSelections)
        .forEach(
          ([format, enabled]) => {

            if (
              typeof enabled !== 'boolean'
            ) {

              throw new Error(
                `Invalid selections.${productKey}.${format}`,
              );

            }

          },
        );

    });

  }

}
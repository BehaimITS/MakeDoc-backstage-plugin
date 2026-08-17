// validates incoming MakeDoc job requests before they are used to create a Kubernetes Job
// required fields must contain strings, optional fields must have the correct types
// workspace requires either a profile or filter, and product selections must contain boolean values

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

  // validates the repository URL
  if (
    !repoUrl ||
    typeof repoUrl !== 'string'
  ) {

    throw new Error(
      'Invalid repository URL',
    );

  }

  // validates the Git access token
  if (
    !accessToken ||
    typeof accessToken !== 'string'
  ) {

    throw new Error(
      'Invalid git access token',
    );

  }

  // validates the input directory
  if (
    !inputDir ||
    typeof inputDir !== 'string'
  ) {

    throw new Error(
      'Invalid input directory',
    );

  }

  // validates the output directory
  if (
    !outputDir ||
    typeof outputDir !== 'string'
  ) {

    throw new Error(
      'Invalid output directory',
    );

  }

  // validates the optional workspace value
  if (
    workspace !== undefined &&
    typeof workspace !== 'string'
  ) {

    throw new Error(
      'Invalid workspace',
    );

  }

  // validates the optional profile value
  if (
    profile !== undefined &&
    typeof profile !== 'string'
  ) {

    throw new Error(
      'Invalid profile',
    );

  }

  // validates the optional filter value
  if (
    filter !== undefined &&
    typeof filter !== 'string'
  ) {

    throw new Error(
      'Invalid filter',
    );

  }

  // requires a profile or filter when a workspace is selected
  if (
    workspace &&
    !profile &&
    !filter
  ) {

    throw new Error(
      'Workspace requires either profile or filter',
    );

  }

  // validates the optional product selections object
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

    // validates selections for each supported product
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

      // ensures each product selection is an object
      if (
        typeof productSelections !== 'object' ||
        Array.isArray(productSelections)
      ) {

        throw new Error(
          `Invalid selections.${productKey} format`,
        );

      }

      // ensures each selected format contains a boolean value
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
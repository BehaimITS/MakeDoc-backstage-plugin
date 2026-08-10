import React, {
  useEffect,
  useState,
} from 'react';

import {
  Button,
  TextField,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Typography,
  Box,
  Tooltip,
  Collapse,
  InputAdornment,
} from '@material-ui/core';

import {
  useApi,
  configApiRef,
  alertApiRef,
} from '@backstage/core-plugin-api';

import HelpOutlineIcon from '@material-ui/icons/HelpOutline';

const STORAGE_KEY =
  'makedoc-execution-form';



type Product =
  | 'bw5'
  | 'bw6'
  | 'ems';



type Format =
  | 'html'
  | 'pdf'
  | 'md'
  | 'docx';



interface FormatSelection {

  html: boolean;

  pdf: boolean;

  md: boolean;

  docx: boolean;

}



interface ProductFormats {

  [key: string]: FormatSelection;

}



interface ExecutionFormProps {

  onJobStarted: (
    jobName: string,
  ) => void;

}



export const ExecutionForm = ({
  onJobStarted,
}: ExecutionFormProps) => {


  const config =
    useApi(configApiRef);


  const alertApi =
    useApi(alertApiRef);



  const [repoUrl, setRepoUrl] =
    useState('');

  const [accessToken, setAccessToken] =
    useState('');

  const [inputDir, setInputDir] =
    useState('');

  const [outputDir, setOutputDir] =
    useState('');

    const [workspace, setWorkspace] =
      useState('');

    const [profile, setProfile] =
      useState('');

    const [filter, setFilter] =
      useState('');


  const [products, setProducts] =
    useState<Record<Product, boolean>>({

      bw5: false,
      bw6: false,
      ems: false,

    });



  const [formats, setFormats] =
    useState<ProductFormats>({

      bw5: {
        html: false,
        pdf: false,
        md: false,
        docx: false,
      },

      bw6: {
        html: false,
        pdf: false,
        md: false,
        docx: false,
      },

      ems: {
        html: false,
        pdf: false,
        md: false,
        docx: false,
      },

    });

  useEffect(() => {

    const saved =
      localStorage.getItem(
        STORAGE_KEY,
      );


    if (!saved) {
      return;
    }


    try {

      const data =
        JSON.parse(saved);



      if (data.repoUrl) {
        setRepoUrl(
          data.repoUrl,
        );
      }



      if (data.inputDir) {
        setInputDir(
          data.inputDir,
        );
      }



      if (data.outputDir) {
        setOutputDir(
          data.outputDir,
        );
      }



      if (data.products) {
        setProducts(
          data.products,
        );
      }



      if (data.formats) {
        setFormats(
          data.formats,
        );
      }

      if (data.workspace) {
        setWorkspace(
          data.workspace,
        );
      }


      if (data.profile) {
        setProfile(
          data.profile,
        );
      }


      if (data.filter) {
        setFilter(
          data.filter,
        );
      }

    } catch(error) {

      console.error(
        'Failed loading MakeDoc form state',
        error,
      );

    }


  }, []);


  useEffect(() => {


    const data = {

      repoUrl,

      inputDir,

      outputDir,

      workspace,

      profile,

      filter,

      products,

      formats,

    };


    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data),
    );


  }, [
  repoUrl,
  inputDir,
  outputDir,
  workspace,
  profile,
  filter,
  products,
  formats,
]);




  const handleProductChange =
    (product: Product) =>
    (
      event:
      React.ChangeEvent<HTMLInputElement>,
    ) => {


      setProducts(prev => ({

        ...prev,

        [product]:
          event.target.checked,

      }));

    };




  const handleFormatChange =
    (
      product: Product,
      format: Format,
    ) =>
    (
      event:
      React.ChangeEvent<HTMLInputElement>,
    ) => {


      setFormats(prev => ({

        ...prev,

        [product]: {

          ...prev[product],

          [format]:
            event.target.checked,

        },

      }));

    };




  const runPipeline = async () => {


    const backendUrl =
      config.getString(
        'backend.baseUrl',
      );



    const payload = {

      repoUrl,

      accessToken,

      inputDir,

      outputDir,

      workspace,

      profile,

      filter,


      selections: {

        bw5:
          products.bw5
            ? formats.bw5
            : null,


        bw6:
          products.bw6
            ? formats.bw6
            : null,


        ems:
          products.ems
            ? formats.ems
            : null,

      },


    };



    try {


      const response =
        await fetch(
          `${backendUrl}/api/makedoc/run-job`,
          {

            method:
              'POST',

            headers: {

              'Content-Type':
                'application/json',

            },

            body:
              JSON.stringify(payload),

          },
        );



      const data =
        await response.json();



      if (!response.ok) {

        throw new Error(
          data.details ||
          data.error ||
          'Server error',
        );

      }



      onJobStarted(
        data.jobName,
      );



    } catch(err: any) {


      alertApi.post({

        message:
          `Execution dispatch failed: ${
            err.message || err
          }`,

        severity:
          'error',

        display:
          'transient',
      });

    }

  };




  const renderFormatSelectors =
    (product: Product) => (

      <Collapse
        in={
          products[product]
        }
      >

        <Box
          pl={4}
          mb={2}
          style={{
            borderLeft:
              '2px solid #ccc',
          }}
        >

          <Typography
            variant="caption"
            color="textSecondary"
          >

            Select Formats for{' '}
            {product.toUpperCase()}:

          </Typography>



          <FormGroup row>

            {(
              [
                'html',
                'pdf',
                'md',
                'docx',
              ] as Format[]
            ).map(format => (

              <FormControlLabel

                key={format}

                control={

                  <Checkbox

                    checked={
                      formats[product][format]
                    }

                    onChange={
                      handleFormatChange(
                        product,
                        format,
                      )
                    }

                    size="small"

                  />

                }

                label={
                  format.toUpperCase()
                }

              />

            ))}


          </FormGroup>


        </Box>


      </Collapse>

    );



  return (

    <Box
      p={3}
      style={{
        maxWidth: 600,
      }}
    >

      <Typography
        variant="h5"
        gutterBottom
      >

        MakeDoc Execution

      </Typography>




      <TextField

        label="Repository URL *"

        variant="outlined"

        fullWidth

        margin="normal"

        value={repoUrl}

        onChange={e =>
          setRepoUrl(
            e.target.value,
          )
        }

        InputProps={{

          endAdornment: (

            <InputAdornment position="end">

              <Tooltip title="The URL of the private GitHub repository containing the source files.">

                <HelpOutlineIcon
                  fontSize="small"
                />

              </Tooltip>

            </InputAdornment>

          ),

        }}

      />




      <TextField

        label="Git Access Token *"

        variant="outlined"

        type="password"

        fullWidth

        margin="normal"

        value={accessToken}

        onChange={e =>
          setAccessToken(
            e.target.value,
          )
        }

        InputProps={{

          endAdornment: (

            <InputAdornment position="end">

              <Tooltip title="Access token used to authenticate against the Git repository.">

                <HelpOutlineIcon
                  fontSize="small"
                />

              </Tooltip>

            </InputAdornment>

          ),

        }}

      />




      <TextField

        label="Input Subdirectory Path *"

        variant="outlined"

        fullWidth

        margin="normal"

        value={inputDir}

        onChange={e =>
          setInputDir(
            e.target.value,
          )
        }

        InputProps={{

          endAdornment: (

            <InputAdornment position="end">

              <Tooltip title="Input directory path relative to the root of the repository.">

                <HelpOutlineIcon
                  fontSize="small"
                />

              </Tooltip>

            </InputAdornment>

          ),

        }}

      />




      <TextField

        label="Output Target Path *"

        variant="outlined"

        fullWidth

        margin="normal"

        value={outputDir}

        onChange={e =>
          setOutputDir(
            e.target.value,
          )
        }

        InputProps={{

          endAdornment: (

            <InputAdornment position="end">

              <Tooltip title="Directory where generated documentation will be written.">

                <HelpOutlineIcon
                  fontSize="small"
                />

              </Tooltip>

            </InputAdornment>

          ),

        }}

      />




      <Box
        mt={6}
        mb={0}
      >

        <Typography
          variant="subtitle1"
        >

          MakeDoc workspace configuration:

        </Typography>

      </Box>




      <TextField

        label="Workspace"

        variant="outlined"

        fullWidth

        margin="normal"

        value={workspace}

        onChange={e =>
          setWorkspace(
            e.target.value,
          )
        }

        InputProps={{

          endAdornment: (

            <InputAdornment position="end">

              <Tooltip title="Optional MakeDoc workspace configuration used during documentation generation.">

                <HelpOutlineIcon
                  fontSize="small"
                />

              </Tooltip>

            </InputAdornment>

          ),

        }}

      />




      <TextField

        label="Profile"

        variant="outlined"

        fullWidth

        margin="normal"

        value={profile}

        onChange={e =>
          setProfile(
            e.target.value,
          )
        }

        InputProps={{

          endAdornment: (

            <InputAdornment position="end">

              <Tooltip title="Optional custom MakeDoc profile.">

                <HelpOutlineIcon
                  fontSize="small"
                />

              </Tooltip>

            </InputAdornment>

          ),

        }}

      />




      <TextField

        label="Filter"

        variant="outlined"

        fullWidth

        margin="normal"

        value={filter}

        onChange={e =>
          setFilter(
            e.target.value,
          )
        }

        InputProps={{

          endAdornment: (

            <InputAdornment position="end">

              <Tooltip title="Optional filter.">

                <HelpOutlineIcon
                  fontSize="small"
                />

              </Tooltip>

            </InputAdornment>

          ),

        }}

      />




      <Box
        mt={6}
        mb={1}
      >

        <Typography
          variant="subtitle1"
        >

          TIBCO product configuration:

        </Typography>

      </Box>




      <FormGroup>

        {(
          [
            [
              'bw5',
              'Enable TIBCO BusinessWorks 5 (BW5)',
            ],

            [
              'bw6',
              'Enable TIBCO BusinessWorks 6 / Container Edition (BW6)',
            ],

            [
              'ems',
              'Enable TIBCO Enterprise Message Service (EMS)',
            ],

          ] as [Product, string][]
        ).map(
          ([product, label]) => (

            <React.Fragment key={product}>

              <FormControlLabel

                control={

                  <Checkbox

                    checked={
                      products[product]
                    }

                    onChange={
                      handleProductChange(
                        product,
                      )
                    }

                  />

                }

                label={label}

              />



              {renderFormatSelectors(product)}


            </React.Fragment>

          )

        )}

      </FormGroup>




      <Box
        mt={4}
      >

        <Button

          variant="contained"

          color="primary"

          onClick={runPipeline}

          fullWidth

          disabled={
            !repoUrl ||
            !accessToken
          }

        >

          Generate documentation

        </Button>


      </Box>


    </Box>

  );
};
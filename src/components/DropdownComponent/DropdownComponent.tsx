import { useState } from 'react';
import { Typography, Grid, Button, FormControl, InputLabel, Select, MenuItem, Snackbar, IconButton } from '@material-ui/core';
import { InfoCard, Header, Content, ContentHeader, SupportButton } from '@backstage/core-components';
import CloseIcon from '@material-ui/icons/Close';

export const DropdownComponent = () => {
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [openSnackbar, setOpenSnackbar] = useState<boolean>(false);
  const [savedValuve, setSavedValue] = useState<string>('');

  const handleChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    setSelectedOption(event.target.value as string);
  };

  const handleButtonClick = () => {
    setOpenSnackbar(true);
    setSavedValue(selectedOption);
    setSelectedOption(''); 
  };

  // Close the Snackbar
  const handleCloseSnackbar = (event?: React.SyntheticEvent, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpenSnackbar(false); // Close the Snackbar
  };

  return (
    <>

            <InfoCard title="Configuration">
              <Grid container direction="column" spacing={2}>
                <Grid item>
                  <FormControl fullWidth>
                    <InputLabel id="dropdown-label">Run Environment</InputLabel>
                    <Select
                      labelId="dropdown-label"
                      value={selectedOption}
                      onChange={handleChange}
                      label="Select Option"
                    >
                      <MenuItem value="agent">Agent</MenuItem>
                      <MenuItem value="local">Local</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleButtonClick}
                    style={{ marginTop: '20px' }}
                  >
                    Submit
                  </Button>
                </Grid>
                <Grid item>
                  <Typography variant="body1">
                    {selectedOption ? `You selected: ${selectedOption}` : 'No option selected'}
                  </Typography>
                </Grid>
              </Grid>
            </InfoCard>


      {/* Snackbar to display the selected option */}
      <Snackbar
        open={openSnackbar}
        autoHideDuration={2000}
        onClose={handleCloseSnackbar}
        message={`You selected: ${savedValuve}`}
        action={
          <IconButton size="small" aria-label="close" color="inherit" onClick={handleCloseSnackbar}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />
    </>
  );
};

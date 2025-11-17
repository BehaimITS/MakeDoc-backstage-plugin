import { Typography, Grid } from '@material-ui/core';
import {
  InfoCard,
  Header,
  Page,
  Content,
  ContentHeader,
  HeaderLabel,
  SupportButton,
} from '@backstage/core-components';
import { DropdownComponent } from '../DropdownComponent';

export const MakeDocComponent = () => (
  <Page themeId="tool">
    <Header title="MakeDoc" subtitle="MakeDoc® provides automatic code review and analysis of TIBCO projects.">
      <HeaderLabel label="Owner" value="Behaim ITS" />
    </Header>
    <Content>
      <ContentHeader title="MakeDoc">
        <SupportButton>MakeDoc® provides automatic code review and analysis of TIBCO projects.</SupportButton>
      </ContentHeader>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <DropdownComponent />
        </Grid>
      </Grid>
    </Content>
  </Page>
);

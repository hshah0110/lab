import { makeStyles, tokens } from "@fluentui/react-components";

export const useStyles = makeStyles({
  content: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  video: {
    width: "100%",
    maxHeight: "220px",
    backgroundColor: tokens.colorNeutralBackground3,
    objectFit: "cover",
  },
  image: {
    width: "160px",
    height: "160px",
    objectFit: "contain",
  },
  product: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
  },
});

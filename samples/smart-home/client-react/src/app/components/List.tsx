export interface ListProps {
  name: string;
  description: string;
  children: React.ReactNode;
}

export const List = ({ name, description, children }: ListProps) => {
  return (
    <div className="flex flex-col gap-2 border border-red-500 ">
      <div>{name}</div>
      <div>{description}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
};

export const ListItem = ({ content }: { content: string }) => {
  return (
    <div className="flex flex-col gap-2 border border-blue-500">
      <div>{content}</div>
    </div>
  );
};

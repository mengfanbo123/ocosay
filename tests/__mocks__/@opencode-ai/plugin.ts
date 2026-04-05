const schema = {
  string: () => ({
    describe: (desc: string) => ({ describe: desc }),
    optional: () => ({
      describe: (desc: string) => ({ describe: desc })
    }),
    number: () => ({
      describe: (desc: string) => ({ describe: desc }),
      optional: () => ({
        describe: (desc: string) => ({ describe: desc })
      })
    }),
    enum: (values: string[]) => ({
      describe: (desc: string) => ({ describe: desc }),
      optional: () => ({
        describe: (desc: string) => ({ describe: desc })
      })
    })
  })
}

function tool({ description, args, execute }: any) {
  return {
    description,
    args,
    execute,
    schema
  }
}

export { tool, schema }
export const Plugin = jest.fn()

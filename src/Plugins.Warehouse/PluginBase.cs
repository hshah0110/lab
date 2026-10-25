using Microsoft.Xrm.Sdk;
using System;

namespace Plugins.Warehouse
{
    public interface ILocalPluginContext
    {
        IPluginExecutionContext PluginExecutionContext { get; }
        IOrganizationServiceFactory OrgSvcFactory { get; }
        ITracingService TracingService { get; }
    }

    public abstract class PluginBase : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            if (serviceProvider == null)
            {
                throw new ArgumentNullException(nameof(serviceProvider));
            }

            ExecuteDataversePlugin(new LocalPluginContext(serviceProvider));
        }

        protected abstract void ExecuteDataversePlugin(ILocalPluginContext localPluginContext);

        private sealed class LocalPluginContext : ILocalPluginContext
        {
            public LocalPluginContext(IServiceProvider serviceProvider)
            {
                PluginExecutionContext = GetRequiredService<IPluginExecutionContext>(serviceProvider);
                OrgSvcFactory = GetRequiredService<IOrganizationServiceFactory>(serviceProvider);
                TracingService = GetRequiredService<ITracingService>(serviceProvider);
            }

            public IPluginExecutionContext PluginExecutionContext { get; }
            public IOrganizationServiceFactory OrgSvcFactory { get; }
            public ITracingService TracingService { get; }

            private static T GetRequiredService<T>(IServiceProvider serviceProvider) where T : class
            {
                var service = serviceProvider.GetService(typeof(T)) as T;
                if (service == null)
                {
                    throw new InvalidOperationException($"Dataverse did not provide the required service {typeof(T).FullName}.");
                }

                return service;
            }
        }
    }
}

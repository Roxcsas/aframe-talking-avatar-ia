import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import {AvatarComponent} from "./avatar/avatar.component";

const routes: Routes = [
  {
    path: '',
    redirectTo: '/home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    component: AvatarComponent,
  },
  {
    path: '**',
    component: AvatarComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
